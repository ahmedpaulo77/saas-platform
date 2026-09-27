// Regression tests for the seat-cap logic. Pure, no Firebase.
//   node tools/test-limits.mjs
import {
  limitFor, countFor, seatsLeft, isAtCap, seatStatus, tallyCompany,
  parseLimitInput, counterFieldFor, isAdminRole, isCappedRole,
} from "../src/utils/limits.js";

let pass = 0, fail = 0;
const check = (n, c, got) => { c ? (pass++, console.log("  OK    " + n)) : (fail++, console.log("  FAIL  " + n + "   got=" + JSON.stringify(got))); };

const admin = { maxAdmins: 2, maxUsers: 5, adminsCount: 1, usersCount: 3 };
const open = { maxAdmins: 0, maxUsers: 0, adminsCount: 4, usersCount: 40 };
const fresh = { isActive: true, name: "New Co" };

console.log("--- which cap applies ---");
check("admin uses maxAdmins", limitFor(admin, "admin") === 2, limitFor(admin, "admin"));
check("user uses maxUsers", limitFor(admin, "user") === 5, limitFor(admin, "user"));
check("cashier shares maxUsers", limitFor(admin, "cashier") === 5, limitFor(admin, "cashier"));
check("kitchen shares maxUsers", limitFor(admin, "kitchen") === 5, limitFor(admin, "kitchen"));
check("isAdminRole admin", isAdminRole("admin"));
check("isAdminRole cashier false", !isAdminRole("cashier"));
check("counterField admin", counterFieldFor("admin") === "adminsCount", counterFieldFor("admin"));
check("counterField user", counterFieldFor("user") === "usersCount", counterFieldFor("user"));

console.log("\n--- unlimited: the state every company starts in ---");
check("fresh company has no admin cap", limitFor(fresh, "admin") === 0);
check("fresh company has no user cap", limitFor(fresh, "user") === 0);
check("seatsLeft admin = Infinity", seatsLeft(fresh, "admin") === Infinity);
check("50 admins on an unlimited company is fine", isAtCap(open, "admin") === false);

console.log("\n--- at the cap ---");
check("1 of 2 admins -> 1 seat left", seatsLeft(admin, "admin") === 1, seatsLeft(admin, "admin"));
const full = { maxAdmins: 2, maxUsers: 5, adminsCount: 2, usersCount: 5 };
check("2 of 2 admins -> at cap", isAtCap(full, "admin") === true);
check("5 of 5 users -> at cap", isAtCap(full, "user") === true);
check("at cap admins: 0 left", seatsLeft(full, "admin") === 0);
check("full user cap: 0 left", seatsLeft(full, "user") === 0);

console.log("\n--- already over the cap (super admin lowered it) ---");
const over = { maxAdmins: 1, maxUsers: 2, adminsCount: 4, usersCount: 9 };
const st = seatStatus(over, "user", 9);
check("over = true", st.over === true);
check("left clamps to 0", st.left === 0, st.left);
check("used still reported", st.used === 9);
check("isAtCap when over", isAtCap(over, "user") === true);

console.log("\n--- super_admin is never capped ---");
check("super_admin with no company is uncapped", isCappedRole("super_admin", null) === false);
check("super_admin attached to a company is still uncapped", isCappedRole("super_admin", "c1") === false);
check("normal user with a company is capped", isCappedRole("user", "c1") === true);

console.log("\n--- seatStatus prefers the live count over the cached one ---");
const s1 = seatStatus(admin, "user", 4);
check("uses liveCount when given", s1.used === 4, s1.used);
check("left recomputed from live", s1.left === 1, s1.left);
const s2 = seatStatus(admin, "user");
check("falls back to the cached count", s2.used === 3, s2.used);

console.log("\n--- tallyCompany recomputes the truth from user docs ---");
const users = [
  { companyId: "c1", role: "admin" },
  { companyId: "c1", role: "admin" },
  { companyId: "c1", role: "user" },
  { companyId: "c1", role: "cashier" },
  { companyId: "c1", role: "kitchen" },
  { companyId: "c1", role: "super_admin" },
  { companyId: "c2", role: "user" },
];
const tally = tallyCompany("c1", users);
check("admins counted", tally.adminsCount === 2, tally.adminsCount);
check("users counted (user+cashier+kitchen)", tally.usersCount === 3, tally.usersCount);
check("super_admin not counted", tally.adminsCount === 2);
check("other companies ignored", tallyCompany("c2", users).usersCount === 1);
check("unknown company -> zeros", JSON.stringify(tallyCompany("nope", users)) === '{"adminsCount":0,"usersCount":0}');

console.log("\n--- parseLimitInput: what the super admin types ---");
check("empty = unlimited", parseLimitInput("") === 0);
check("null = unlimited", parseLimitInput(null) === 0);
check("undefined = unlimited", parseLimitInput(undefined) === 0);
check('"3" -> 3', parseLimitInput("3") === 3);
check('"0" -> unlimited', parseLimitInput("0") === 0);
check('"-5" clamps to unlimited (never a negative cap)', parseLimitInput("-5") === 0);
check('"abc" -> unlimited', parseLimitInput("abc") === 0);
check('"100" -> 100', parseLimitInput("100") === 100);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
