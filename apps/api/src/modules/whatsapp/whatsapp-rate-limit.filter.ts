import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';

@Catch(HttpException)
export class WhatsappRateLimitFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const status = exception.getStatus();
    if (status === 429) response.setHeader('Retry-After', '3600');
    const body = exception.getResponse();
    response.status(status).json(typeof body === 'string'
      ? { statusCode: status, message: body }
      : body);
  }
}
