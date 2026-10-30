import { Equals, IsEmail, IsEnum, IsIn, IsOptional, IsString, Matches, MinLength, ValidateIf } from 'class-validator';
import { Track } from '@prisma/client';

export const EG_MOBILE = /^01[0125]\d{8}$/;

export class RegisterDto {
  @IsString() @MinLength(2) name!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @Matches(EG_MOBILE, { message: 'Enter an Egyptian mobile number like 01012345678' }) phone?: string;
  @IsIn(['STUDENT', 'PARENT']) accountType!: 'STUDENT' | 'PARENT';
  @ValidateIf((o) => o.accountType === 'STUDENT') @IsEnum(Track) track?: Track;
  /** Must be true: the Terms and Privacy Policy were accepted (for under-18 students, with a parent's permission) */
  @Equals(true, { message: 'Please accept the Terms and Privacy Policy to create an account' }) acceptTerms!: boolean;
  /** Language of the site when they signed up; our emails to them use it */
  @IsOptional() @IsIn(['en', 'ar']) language?: 'en' | 'ar';
}

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}

export class ForgotPasswordDto {
  @IsEmail() email!: string;
}

export class ResetPasswordDto {
  @IsString() token!: string;
  @IsString() @MinLength(8) password!: string;
}

export class GoogleDto {
  /** The Google ID token (JWT) returned by Google Identity Services */
  @IsString() credential!: string;
  /** Only needed the first time, when the account is created */
  @IsOptional() @IsIn(['STUDENT', 'PARENT']) accountType?: 'STUDENT' | 'PARENT';
  @ValidateIf((o) => o.accountType === 'STUDENT') @IsEnum(Track) track?: Track;
  /** Needed only when the account is created */
  @IsOptional() acceptTerms?: boolean;
  @IsOptional() @IsIn(['en', 'ar']) language?: 'en' | 'ar';
}
