import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  validateSync,
} from 'class-validator';
import { plainToInstance } from 'class-transformer';

export class ContactDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsEmail()
  @IsNotEmpty()
  @MaxLength(150)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(5000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string | null;
}

export function validateContact(body: unknown): {
  dto: ContactDto;
  errors: string[];
} {
  if (Array.isArray(body)) return { dto: new ContactDto(), errors: ['body must be an object'] };
  const dto = plainToInstance(ContactDto, body ?? {});
  const errors = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: false,
    stopAtFirstError: true,
  }).flatMap((error) => Object.values(error.constraints ?? {}));
  return { dto, errors };
}
