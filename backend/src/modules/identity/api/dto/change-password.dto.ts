import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../../domain/password-policy.js';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword: string;

  /** The password policy is checked by the service, which reports every problem at once. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX_LENGTH + 64)
  newPassword: string;
}
