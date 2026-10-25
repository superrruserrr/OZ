import { Controller, Get, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthReportDto } from './health.dto.js';
import { HealthService, type HealthReport } from './health.service.js';

/**
 * Seul endpoint public sans authentification : sondes de disponibilité (§12.2).
 * La réponse ne contient que des états up/down, jamais d'hôte ni de message d'erreur ;
 * le résultat est partagé entre appels simultanés et réutilisé 2 s (pas d'amplification).
 */
@ApiTags('santé')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'État de l’API et de ses dépendances (public, sans authentification)' })
  @ApiOkResponse({ type: HealthReportDto, description: 'Toutes les dépendances répondent' })
  @ApiServiceUnavailableResponse({
    type: HealthReportDto,
    description: 'Au moins une dépendance est indisponible',
  })
  async get(@Res({ passthrough: true }) response: Response): Promise<HealthReport> {
    const report = await this.health.check();
    response.status(report.status === 'ok' ? 200 : 503);
    return report;
  }
}
