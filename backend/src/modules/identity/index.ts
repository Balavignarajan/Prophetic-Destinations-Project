// Public surface of the identity module. Other modules import only from here.
export { IdentityModule } from './identity.module.js';
export { Role } from './domain/role.js';
export type { AuthenticatedAdmin } from './domain/admin-account.js';
export { Roles } from './guards/roles.decorator.js';
export { CurrentAdmin } from './guards/current-admin.decorator.js';
