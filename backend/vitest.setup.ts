/**
 * The environment the unit tests need, which is almost none.
 *
 * `src/env.ts` validates the whole environment the moment it is imported and
 * throws when DATABASE_URL is absent. That is right for a server booting, but
 * several suites here test pure functions that happen to live in a module which
 * also imports `prisma.ts` — so importing `leave.js` for a date calculation
 * drags in the client, and the validation with it.
 *
 * `.env` is deliberately not committed, so on CI and on a fresh clone that throw
 * took out five suites before they reached a single assertion. The placeholder
 * below is what stops it.
 *
 * Nothing connects. Every suite that reaches the client mocks it, and Prisma
 * does not open a connection just by being constructed — this value exists to
 * satisfy a schema, not to be dialled. Keeping it fixed also makes the tests
 * hermetic: they behave the same whether or not the machine running them has a
 * database configured, which is the whole point of a unit test.
 *
 * An explicitly exported DATABASE_URL still wins, for anyone who wants to point
 * a suite somewhere real.
 */
process.env.DATABASE_URL ??= 'postgresql://vig:vig@127.0.0.1:5432/vig_unit_tests';
