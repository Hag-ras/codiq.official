/* Unit test of the admin-area rule (no server needed): npm run test:guard */
import { isAdminAreaPath } from '../src/common/admin-area.guard';

const admin = ['/api/admin/stats', '/api/admin', '/api/admin/', '/API/ADMIN/stats', '/api//admin/x', '/api/./admin/x', '/api/%61dmin/x', '/api/Admin%2Fx', '/api/admin/coupons?x=1', '/api/reports/admin/users', '/admin/x', '/api/%E0%A4%A'];
const open = ['/api/packages', '/api/auth/login', '/api/payments/webhooks/paymob', '/api/administrator/x', '/api/users', '/api/account/profile', '/api/sessions/admin-guide'];
let bad = 0;
for (const u of admin) if (!isAdminAreaPath(u)) { console.log(`  FAIL  should be admin area: ${u}`); bad++; }
for (const u of open) if (isAdminAreaPath(u)) { console.log(`  FAIL  should NOT be admin area: ${u}`); bad++; }
console.log(bad ? `${bad} FAILED` : `PASS  ${admin.length + open.length} URL cases (case, slashes, dots, encoding, nested /admin)`);
process.exit(bad ? 1 : 0);
