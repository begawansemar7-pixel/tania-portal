import { IsArray, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveTaskDto {
  @IsString()
  @MaxLength(64)
  id!: string;

  @IsString()
  @MaxLength(32)
  status!: string;

  /**
   * Approval ids appearing in the plan, promoted out of the report so a decided
   * approval can find its task without scanning every row.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  approvalIds?: string[];

  /** The full `TaskReport`; its shape is owned by `@tania/types`. */
  @IsObject()
  report!: Record<string, unknown>;
}
