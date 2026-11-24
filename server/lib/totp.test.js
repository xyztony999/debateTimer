import { describe, expect, test } from 'bun:test';
import {
    buildOtpauthUri,
    currentStep,
    findMatchingStep,
    formatRecoveryCode,
    generateRecoveryCodes,
    generateSecret,
    hashRecoveryCode,
    hotp,
    isSixDigitCode,
    isValidRecoveryCode,
    normalizeRecoveryCode,
    toBase32,
    TOTP_SECRET_BYTES,
    TOTP_WINDOW_STEPS,
} from './totp.js';

// Reference secret shared by RFC 4226 Appendix D and RFC 6238 Appendix B.
const REFERENCE_KEY = Buffer.from('12345678901234567890');

test('HOTP reproduces the ten RFC 4226 Appendix D vectors', () => {
    // Counter 0..9, 6 digits. These values are the published test vectors.
    const expected = [
        '755224', '287082', '359152', '969429', '338314',
        '254676', '287922', '162583', '399871', '520489',
    ];
    expected.forEach((code, counter) => {
        expect(hotp(REFERENCE_KEY, counter, 6)).toBe(code);
    });
});

test('TOTP reproduces the RFC 6238 Appendix B SHA-1 rows', () => {
    // Unix time -> 8-digit code. The expected values were computed in this
    // repository with two independent implementations (Node crypto and the
    // Python standard library) and cross-checked by hand for the row at
    // T=1234567890 (digest 907CD1A9..703, offset 3, 0x29116564 -> 89005924).
    const rows = [
        [59, '94287082'],
        [1111111109, '07081804'],
        [1111111111, '14050471'],
        [1234567890, '89005924'],
        [2000000000, '69279037'],
        [20000000000, '65353130'],
    ];
    for (const [time, code] of rows) {
        const step = Math.floor(time / 30);
        expect(hotp(REFERENCE_KEY, step, 8)).toBe(code);
        // The 6-digit form is the trailing six digits, leading zeros kept.
        expect(hotp(REFERENCE_KEY, step, 6)).toBe(code.slice(-6));
    }
});

test('currentStep is Unix time divided into 30-second steps', () => {
    expect(currentStep(0)).toBe(0);
    expect(currentStep(29_999)).toBe(0);
    expect(currentStep(30_000)).toBe(1);
    expect(currentStep(20000000000 * 1000)).toBe(666666666);
});

describe('findMatchingStep', () => {
    // Fixed keys keep the "never matches" assertions deterministic.
    const key = Buffer.alloc(TOTP_SECRET_BYTES, 7);
    const otherKey = Buffer.alloc(TOTP_SECRET_BYTES, 9);
    const now = 1_700_000_000_000;
    const step = currentStep(now);

    test('accepts the code of the current step and of the neighbouring steps', () => {
        expect(findMatchingStep(key, hotp(key, step), { now })).toBe(step);
        for (let offset = 1; offset <= TOTP_WINDOW_STEPS; offset += 1) {
            expect(findMatchingStep(key, hotp(key, step + offset), { now })).toBe(step + offset);
            expect(findMatchingStep(key, hotp(key, step - offset), { now })).toBe(step - offset);
        }
    });

    test('rejects codes outside the tolerance window', () => {
        for (let offset = TOTP_WINDOW_STEPS + 1; offset <= 5; offset += 1) {
            expect(findMatchingStep(key, hotp(key, step + offset), { now })).toBeNull();
            expect(findMatchingStep(key, hotp(key, step - offset), { now })).toBeNull();
        }
    });

    test('rejects malformed input instead of throwing', () => {
        expect(findMatchingStep(key, undefined, { now })).toBeNull();
        expect(findMatchingStep(key, 12345, { now })).toBeNull();
        expect(findMatchingStep(key, '12 34', { now })).toBeNull();
        expect(findMatchingStep(key, 'abcdef', { now })).toBeNull();
    });

    test('tolerates surrounding whitespace typed or pasted by a user', () => {
        expect(findMatchingStep(key, ` ${hotp(key, step)} `, { now })).toBe(step);
    });

    test('never accepts a step at or below the last used one (replay)', () => {
        const code = hotp(key, step);
        expect(findMatchingStep(key, code, { now, minStepExclusive: step - 1 })).toBe(step);
        // The same code submitted again after `step` was recorded: rejected.
        expect(findMatchingStep(key, code, { now, minStepExclusive: step })).toBeNull();
        // A code from an already-used older step: rejected.
        expect(findMatchingStep(key, hotp(key, step - 1), { now, minStepExclusive: step - 1 })).toBeNull();
        // The next step's code is still fine.
        expect(findMatchingStep(key, hotp(key, step + 1), { now, minStepExclusive: step })).toBe(step + 1);
    });

    test('a different key never matches', () => {
        expect(findMatchingStep(otherKey, hotp(key, step), { now })).toBeNull();
        expect(findMatchingStep(key, hotp(otherKey, step), { now })).toBeNull();
    });
});

test('isSixDigitCode checks shape only', () => {
    expect(isSixDigitCode('123456')).toBe(true);
    expect(isSixDigitCode(' 000000 ')).toBe(true);
    expect(isSixDigitCode('12345')).toBe(false);
    expect(isSixDigitCode('1234567')).toBe(false);
    expect(isSixDigitCode('12345a')).toBe(false);
    expect(isSixDigitCode(undefined)).toBe(false);
});

test('secrets are 20 random bytes and round-trip through Base32', () => {
    const secret = generateSecret();
    expect(secret).toBeInstanceOf(Buffer);
    expect(secret.length).toBe(TOTP_SECRET_BYTES);
    const encoded = toBase32(secret);
    expect(encoded).toMatch(/^[A-Z2-7]{32}$/);

    // Independent decoder for the check.
    let bits = 0;
    let value = 0;
    const bytes = [];
    for (const char of encoded) {
        value = (value << 5) | 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char);
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    expect(Buffer.from(bytes)).toEqual(secret);
    expect(generateSecret().equals(secret)).toBe(false);
});

test('toBase32 pads the last group without emitting "="', () => {
    expect(toBase32(Buffer.from([0]))).toBe('AA');
    // 2 bytes = 16 bits -> 4 chars (20 bits): 11111 11111 11111 000(00)
    expect(toBase32(Buffer.from([0xff, 0xfe]))).toBe('777A');
    expect(toBase32(Buffer.from([0x00, 0x00]))).toBe('AAAA');
});

test('buildOtpauthUri follows the key-uri format with standard parameters', () => {
    const uri = buildOtpauthUri('alice', 'JBSWY3DPEHPK3PXP');
    expect(uri).toBe(
        'otpauth://totp/Debate%20Timer:alice?secret=JBSWY3DPEHPK3PXP'
        + '&issuer=Debate%20Timer&algorithm=SHA1&digits=6&period=30',
    );
    const parsed = new URL(uri);
    expect(parsed.searchParams.get('secret')).toBe('JBSWY3DPEHPK3PXP');
    expect(parsed.searchParams.get('issuer')).toBe('Debate Timer');
    expect(parsed.searchParams.get('algorithm')).toBe('SHA1');
    expect(parsed.searchParams.get('digits')).toBe('6');
    expect(parsed.searchParams.get('period')).toBe('30');
    // A username is already restricted to [a-z0-9_]; encoding it is a formality.
    expect(buildOtpauthUri('a_b9', 'X')).toContain('/totp/Debate%20Timer:a_b9?');
});

describe('recovery codes', () => {
    test('ten unique codes of ten characters from the unambiguous alphabet', () => {
        const codes = generateRecoveryCodes();
        expect(codes).toHaveLength(10);
        expect(new Set(codes).size).toBe(10);
        for (const code of codes) {
            expect(code).toMatch(/^[A-Z2-9]{10}$/);
            expect(code).not.toMatch(/[01IO]/);
        }
    });

    test('are shown as two groups of five', () => {
        expect(formatRecoveryCode('ABCDEFGHIJ')).toBe('ABCDE-FGHIJ');
    });

    test('normalize what a user types: case, dash and spaces do not matter', () => {
        expect(normalizeRecoveryCode(' abcde-fghij ')).toBe('ABCDEFGHIJ');
        expect(normalizeRecoveryCode('ABCD-EFGH-IJ')).toBe('ABCDEFGHIJ');
        expect(isValidRecoveryCode(normalizeRecoveryCode('abcde-fghij'))).toBe(true);
        expect(isValidRecoveryCode(normalizeRecoveryCode('abcde'))).toBe(false);
        // Punctuation is stripped; only the alphanumeric core is judged.
        expect(normalizeRecoveryCode('abcdefghij!')).toBe('ABCDEFGHIJ');
        expect(isValidRecoveryCode(normalizeRecoveryCode('abcdefghijk'))).toBe(false);
        expect(isValidRecoveryCode(normalizeRecoveryCode('abcdefghi'))).toBe(false);
        expect(isValidRecoveryCode(normalizeRecoveryCode(undefined))).toBe(false);
    });

    test('hash the normalized form, so presentation never changes the hash', () => {
        expect(hashRecoveryCode('abcde-fghij')).toBe(hashRecoveryCode('ABCDEFGHIJ'));
        expect(hashRecoveryCode('ABCDEFGHIJ')).toMatch(/^[0-9a-f]{64}$/);
        expect(hashRecoveryCode('ABCDEFGHIJ')).not.toBe(hashRecoveryCode('ABCDEFGHIX'));
    });
});
