import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'tania:isPublic';

/** Marks a route as reachable without authentication (health probes only). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
