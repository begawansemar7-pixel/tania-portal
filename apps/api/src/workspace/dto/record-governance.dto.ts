import { IsIn, IsISO8601, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

const RISKS = ['INFORMATIONAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

/**
 * The ten-field governance record.
 *
 * Every field is required because a half-filled record looks complete and is
 * not — the same rule the portal's recorder already enforces before it sends.
 */
export class RecordGovernanceDto {
  @IsString() @MaxLength(64) intent!: string;
  @IsString() @MaxLength(128) agent!: string;
  @IsString() @MaxLength(128) tool!: string;
  @IsString() @MaxLength(64) action!: string;
  @IsString() @MaxLength(64) result!: string;

  @IsIn(RISKS)
  risk!: (typeof RISKS)[number];

  @IsObject()
  dataAccess!: Record<string, unknown>;

  @IsObject()
  verification!: { ok: boolean } & Record<string, unknown>;

  @IsString() @MaxLength(64) correlationId!: string;

  @IsOptional()
  @IsISO8601()
  timestamp?: string;
}
