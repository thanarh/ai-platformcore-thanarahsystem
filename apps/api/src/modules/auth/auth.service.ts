import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { TenantsService } from '../tenants/tenants.service';
import { Role } from '../../common/decorators/roles.decorator';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private tenantsService: TenantsService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    tenantSlug?: string;
  }) {
    if (data.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    // Resolve or create tenant
    let tenantId: string;
    if (data.tenantSlug) {
      const tenant = await this.tenantsService.findBySlug(data.tenantSlug);
      if (!tenant) throw new BadRequestException('Organization not found');
      tenantId = tenant._id.toString();
    } else {
      // Create a personal tenant for the user
      const slug = `tenant-${Date.now()}`;
      const tenant = await this.tenantsService.create({
        slug,
        name: `${data.firstName}'s Workspace`,
        type: 'organization',
        status: 'active',
      });
      tenantId = tenant._id.toString();
    }

    // Check if this is the first user (make them OWNER)
    const totalUsers = await this.usersService.getTotalCount();
    const role = totalUsers === 0 ? Role.OWNER : Role.USER;

    const user = await this.usersService.create({
      email: data.email,
      password: data.password,
      firstName: data.firstName,
      lastName: data.lastName,
      role,
      tenantId,
    });

    const tokens = await this.generateTokens(user);
    await this.usersService.updateRefreshToken(user._id.toString(), tokens.refreshToken);

    return {
      user: this.usersService.toPublic(user),
      ...tokens,
    };
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isValid = await this.usersService.validatePassword(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.usersService.updateLastLogin(user._id.toString());

    const tokens = await this.generateTokens(user);
    await this.usersService.updateRefreshToken(user._id.toString(), tokens.refreshToken);

    return {
      user: this.usersService.toPublic(user),
      ...tokens,
    };
  }

  async logout(userId: string) {
    await this.usersService.updateRefreshToken(userId, null);
    return { success: true };
  }

  async getMe(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    return this.usersService.toPublic(user);
  }

  private async generateTokens(user: any) {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      tenantId: user.tenantId?.toString(),
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('jwt.secret'),
      expiresIn: this.configService.get('jwt.expiresIn'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('jwt.refreshSecret'),
      expiresIn: this.configService.get('jwt.refreshExpiresIn'),
    });

    return { accessToken, refreshToken };
  }
}
