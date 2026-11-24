import { expect, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { createPreloginTickets } from './preloginTickets.js';

function harness() {
    let clock = 1_000_000;
    const tickets = createPreloginTickets({ ttlMs: 300_000, max: 3, now: () => clock });
    return { tickets, tick: (ms) => { clock += ms; } };
}

const alice = new ObjectId();
const bob = new ObjectId();

test('a ticket resolves to the account it was issued for', () => {
    const { tickets } = harness();
    const ticket = tickets.issue(alice);
    expect(ticket).toMatch(/^[0-9a-f]{64}$/);
    expect(tickets.peek(ticket)).toBe(alice);
    expect(tickets.peek('not-a-ticket')).toBeNull();
    expect(tickets.peek(undefined)).toBeNull();
    expect(tickets.peek('')).toBeNull();
});

test('tickets are single use values and unique per issue', () => {
    const { tickets } = harness();
    const first = tickets.issue(alice);
    const second = tickets.issue(alice);
    expect(first).not.toBe(second);
    expect(tickets.peek(first)).toBe(alice);
    expect(tickets.peek(second)).toBe(alice);
});

test('a ticket can be read repeatedly until it is revoked', () => {
    const { tickets } = harness();
    const ticket = tickets.issue(alice);
    expect(tickets.peek(ticket)).toBe(alice);
    expect(tickets.peek(ticket)).toBe(alice);
    tickets.revoke(ticket);
    expect(tickets.peek(ticket)).toBeNull();
    // Revoking twice is harmless.
    tickets.revoke(ticket);
    expect(tickets.size).toBe(0);
});

test('a ticket expires after its TTL', () => {
    const { tickets, tick } = harness();
    const ticket = tickets.issue(alice);
    tick(299_999);
    expect(tickets.peek(ticket)).toBe(alice);
    tick(1);
    expect(tickets.peek(ticket)).toBeNull();
    expect(tickets.size).toBe(0);
});

test('accounts do not see each other\'s tickets', () => {
    const { tickets } = harness();
    const forAlice = tickets.issue(alice);
    tickets.issue(bob);
    expect(tickets.peek(forAlice)).toBe(alice);
    tickets.revoke(forAlice);
    expect(tickets.size).toBe(1);
});

test('the table is bounded: the fullest state sheds the soonest-expiring entry', () => {
    const { tickets, tick } = harness();
    const first = tickets.issue(alice);
    tick(1000);
    const second = tickets.issue(bob);
    tick(1000);
    const third = tickets.issue(alice);
    expect(tickets.size).toBe(3);
    tick(1000);
    const fourth = tickets.issue(bob); // evicts `first` (expires soonest)
    expect(tickets.size).toBe(3);
    expect(tickets.peek(first)).toBeNull();
    expect(tickets.peek(second)).toBe(bob);
    expect(tickets.peek(third)).toBe(alice);
    expect(tickets.peek(fourth)).toBe(bob);
});

test('a forged value with the right shape is rejected', () => {
    const { tickets } = harness();
    tickets.issue(alice);
    expect(tickets.peek('0'.repeat(64))).toBeNull();
    expect(tickets.peek({ toString: () => 'x' })).toBeNull();
});
