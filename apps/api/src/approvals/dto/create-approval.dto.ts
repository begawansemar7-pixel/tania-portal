import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { RiskLevel } from '../../generated/prisma/enums.js';

const RISK_LEVELS = ['INFORMATIONAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export class CreateApprovalDto {
  @IsOptional() @IsString() @MaxLength(64) id?: string;
  @IsOptional() @IsString() @MaxLength(64) sessionId?: string;
  @IsOptional() @IsString() @MaxLength(64) messageId?: string;

  @IsString() @MaxLength(120) toolId!: string;
  @IsString() @MaxLength(200) action!: string;
  @IsIn(RISK_LEVELS) risk!: RiskLevel;
  @IsString() @MaxLength(500) reason!: string;

  @IsOptional() @IsString() @MaxLength(500) effect?: string;
}
