/**
 * Pre-login tickets for the second-factor step.
 *
 * A ticket proves "the password step already succeeded for this account" and
 * nothing else: it is NOT a session, it lives only in process memory, it
 * expires after five minutes and can be resolved/rejected any number of times
 * until it is revoked. Only the SHA-256 of the ticket is kept, so a memory
 * dump alone cannot replay one. A process restart drops every ticket and the
 * user simply signs in again.
 */
import { createHash, randomBytes } from 'node:crypto';

export const TICKET_TTL_MS = 300_000;
const MAX_TICKETS = 10_000;

function hashTicket(ticket) {
    return createHash('sha256').update(String(ticket)).digest('hex');
}

export function createPreloginTickets({ ttlMs = TICKET_TTL_MS, max = MAX_TICKETS, now = () => Date.now() } = {}) {
    /** @type {Map<string, { userId: object, expiresAt: number }}> ticketHash -> entry */
    const tickets = new Map();

    function sweep() {
        const time = now();
        for (const [hash, entry] of tickets) {
            if (entry.expiresAt <= time) {
                tickets.delete(hash);
            }
        }
    }

    return {
        /** Issues a ticket for userId and returns its plain value (the only time it exists). */
        issue(userId) {
            sweep();
            if (tickets.size >= max) {
                // Shed the soonest-to-expire entries rather than grow without bound.
                const oldest = [...tickets.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
                if (oldest) {
                    tickets.delete(oldest[0]);
                }
            }
            const ticket = randomBytes(32).toString('hex');
            tickets.set(hashTicket(ticket), { userId, expiresAt: now() + ttlMs });
            return ticket;
        },

        /** The account a valid ticket belongs to, or null. Does not consume the ticket. */
        peek(ticket) {
            if (typeof ticket !== 'string' || ticket.length === 0) {
                return null;
            }
            const entry = tickets.get(hashTicket(ticket));
            if (!entry) {
                return null;
            }
            if (entry.expiresAt <= now()) {
                tickets.delete(hashTicket(ticket));
                return null;
            }
            return entry.userId;
        },

        /** Removes a ticket (on success or lockout). Safe to call twice. */
        revoke(ticket) {
            if (typeof ticket === 'string' && ticket.length > 0) {
                tickets.delete(hashTicket(ticket));
            }
        },

        get size() {
            sweep();
            return tickets.size;
        },
    };
}
