import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  channel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  /** Optional client-supplied identifier so a portal session maps 1:1 to a row. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;
}
