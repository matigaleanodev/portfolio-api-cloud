import { plainToInstance, Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, validateSync } from 'class-validator';

export class SubscriptionEmailDto {
  @IsString()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    return value.trim().toLowerCase();
  })
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export function validateSubscription(body: unknown): {
  dto: SubscriptionEmailDto;
  errors: string[];
} {
  if (Array.isArray(body))
    return { dto: new SubscriptionEmailDto(), errors: ['body must be an object'] };

  const dto = plainToInstance(SubscriptionEmailDto, body ?? {});
  const errors = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: false,
    stopAtFirstError: true,
  }).flatMap((error) => Object.values(error.constraints ?? {}));
  return { dto, errors };
}
