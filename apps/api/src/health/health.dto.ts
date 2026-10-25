import { ApiProperty } from '@nestjs/swagger';

/** Schémas OpenAPI (documentation uniquement). */
export class HealthChecksDto {
  @ApiProperty({ enum: ['up', 'down'] }) database!: 'up' | 'down';
  @ApiProperty({ enum: ['up', 'down'] }) redis!: 'up' | 'down';
  @ApiProperty({ enum: ['up', 'down'] }) storage!: 'up' | 'down';
}

export class HealthReportDto {
  @ApiProperty({ enum: ['ok', 'degraded'] }) status!: 'ok' | 'degraded';
  @ApiProperty({ type: HealthChecksDto }) checks!: HealthChecksDto;
}
