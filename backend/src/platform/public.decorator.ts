import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or controller) as intentionally reachable without
 * authentication. Every route is authenticated by default; the identity
 * module's JwtAuthGuard honours this marker. Lives in platform so any module
 * (health, delivery, ...) can use it without depending on identity.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
