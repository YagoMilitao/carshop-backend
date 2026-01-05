import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    // 1) valida credenciais
    this.authService.validateAdmin(dto.email, dto.password);

    // 2) retorna token
    return this.authService.login(dto.email);
  }
}
