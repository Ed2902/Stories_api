import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard'
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard'
import { AdminPermissionsGuard } from './guards/admin-permissions.guard'

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('auth.accessTokenSecret'),
      }),
    }),
  ],
  providers: [
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    AdminJwtAuthGuard,
    AdminPermissionsGuard,
  ],
  exports: [
    JwtModule,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    AdminJwtAuthGuard,
    AdminPermissionsGuard,
  ],
})
export class AuthModule {}
