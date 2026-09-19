import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

const SCOPES = ['SESSION', 'ACTOR', 'ORGANISATION'] as const;
const CLASSIFICATIONS = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'] as const;

export class RememberDto {
  @IsIn(SCOPES)
  scope!: (typeof SCOPES)[number];

  @IsString()
  @MaxLength(200)
  key!: string;

  @IsString()
  @MaxLength(4000)
  value!: string;

  @IsIn(CLASSIFICATIONS)
  classification!: (typeof CLASSIFICATIONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionId?: string;

  /** Absent means "retained until deleted"; deployments should set a policy. */
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
