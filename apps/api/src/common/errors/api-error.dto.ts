import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ApiErrorDetailDto {
  @ApiProperty({ example: 'birthDate' }) field!: string;
  @ApiProperty({ example: 'invalid_format' }) code!: string;
}

/** Schéma OpenAPI du corps d'erreur unique (documentation uniquement, EX-T07 n° 2). */
export class ApiErrorDto {
  @ApiProperty({ example: 'VALIDATION_FAILED' }) code!: string;
  @ApiProperty({ example: 'Données invalides.' }) message!: string;
  @ApiProperty({ example: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0' }) requestId!: string;
  @ApiPropertyOptional({ type: [ApiErrorDetailDto] }) details?: ApiErrorDetailDto[];
}
