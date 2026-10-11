import { SetMetadata } from '@nestjs/common';

export const ALLOW_PASSWORD_CHANGE_PENDING_KEY = 'allowPasswordChangePending';

/**
 * Marks a route that an account may still use while it must change its password (reading itself, and changing the
 * password). Every other authenticated route is refused with 403 until the password has been changed.
 */
export const AllowPasswordChangePending = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_PENDING_KEY, true);
