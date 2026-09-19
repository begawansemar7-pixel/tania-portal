import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideApprovalDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class RecordExecutionDto {
  @IsIn(['SUCCEEDED', 'FAILED'])
  status!: 'SUCCEEDED' | 'FAILED';

  @IsOptional() @IsString() @MaxLength(500) summary?: string;
}
