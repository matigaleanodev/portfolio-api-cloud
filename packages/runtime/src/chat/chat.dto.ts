import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
  validateSync,
  type ValidationError,
} from 'class-validator';

export class ChatHistoryMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @Matches(/\S/)
  @MaxLength(1500)
  content!: string;
}

export class ChatRequestDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(500)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sessionId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => ChatHistoryMessageDto)
  history?: ChatHistoryMessageDto[] | null;
}

export class ChatResponseDto {
  answer!: string;
  suggestedQuestions!: string[];
  source!: 'faq' | 'ai' | 'fallback';
}

export class ChatStartersResponseDto {
  suggestedQuestions!: string[];
}

export function validateChat(body: unknown): { dto: ChatRequestDto; errors: string[] } {
  if (Array.isArray(body)) return { dto: new ChatRequestDto(), errors: ['body must be an object'] };
  const dto = plainToInstance(ChatRequestDto, body ?? {});
  const flatten = (errors: ValidationError[], prefix = ''): string[] =>
    errors.flatMap((error) => [
      ...Object.values(error.constraints ?? {}).map((message) => prefix + message),
      ...flatten(error.children ?? [], prefix + error.property + '.'),
    ]);
  const errors = flatten(
    validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: false,
      stopAtFirstError: true,
    }),
  );
  return { dto, errors };
}
