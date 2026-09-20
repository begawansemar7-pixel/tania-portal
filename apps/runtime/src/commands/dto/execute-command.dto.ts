import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { RISK_LEVELS } from '@tania/types';

/**
 * Validation at the runtime's boundary.
 *
 * TypeScript types are erased at runtime, so `@Body() command: JarvisCommand`
 * asserts nothing about what actually arrived. The dispatcher is defensive and
 * degrades to FAILED or UNSUPPORTED rather than throwing, but degrading is not
 * the same as refusing: a command missing `requiresApproval` entirely would
 * pass the approval guard, because `undefined && …` is falsy.
 *
 * Both other services validate at their edges. The execution layer — the one
 * that actually does things — should not be the exception.
 */
export class ExecuteCommandDto {
  @IsString()
  @MaxLength(64)
  requestId!: string;

  /**
   * Validated as a string, not against `JARVIS_CAPABILITIES`.
   *
   * TANIA and this runtime compile that list independently and deploy
   * separately, so a capability name this build has never heard of is what
   * ordinary version skew looks like — not a malformed caller. The contract
   * already answers that in-band with `UNSUPPORTED` and `retryable: false`,
   * which lets the caller fall back; a 400 would flatten "I do not serve this
   * yet" into "your request is broken" and make a rollout-ordering mismatch
   * look like a client bug.
   *
   * `risk` below is deliberately the opposite: a safety vocabulary with no
   * safe default, where an unrecognised value must be refused outright.
   */
  @IsString()
  @MaxLength(64)
  capability!: string;

  @IsString()
  @MaxLength(64)
  action!: string;

  /** User-safe description. Never chain-of-thought — the contract says so. */
  @IsString()
  @MaxLength(500)
  task!: string;

  @IsObject()
  parameters!: Record<string, unknown>;

  @IsIn(RISK_LEVELS)
  risk!: (typeof RISK_LEVELS)[number];

  /**
   * Required, not optional.
   *
   * An omitted flag reads as "no approval needed" to the guard. Demanding it
   * explicitly means a caller has to state the claim before the runtime will
   * weigh it.
   */
  @IsBoolean()
  requiresApproval!: boolean;

  @IsOptional() @IsString() @MaxLength(64) approvalId?: string;
  @IsOptional() @IsString() @MaxLength(64) correlationId?: string;
  @IsOptional() @IsString() @MaxLength(64) sessionId?: string;
  @IsOptional() @IsString() @MaxLength(64) taskId?: string;
  @IsOptional() @IsString() @MaxLength(128) actorId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600_000)
  timeoutMs?: number;
}
