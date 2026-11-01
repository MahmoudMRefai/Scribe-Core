import { CourierRepository } from './courier.repository.js';
import { ConflictException, NotFoundException } from '../../shared/errors.js';
import { prisma } from '../../config/prisma.js';
import { normalizePhone } from '../../shared/phone.util.js';
import bcrypt from 'bcryptjs';

export class CourierService {
  static async getById(id: string) {
    const courier = await CourierRepository.findById(id);
    if (!courier) throw new NotFoundException('Courier', id);
    return courier;
  }

  static async getByUserId(userId: string) {
    const courier = await CourierRepository.findByUserId(userId);
    if (!courier) throw new NotFoundException('Courier', userId);
    return courier;
  }

  static async list(page = 1, pageSize = 20) {
    return CourierRepository.findMany(page, pageSize);
  }

  static async update(
    id: string,
    data: {
      name?: string;
      phone?: string;
      password?: string;
      email?: string;
      vehicleType?: any;
      address?: string;
      currentLocation?: string;
      isActive?: boolean;
    },
  ) {
    const courier = await CourierRepository.findById(id);
    if (!courier) throw new NotFoundException('Courier', id);

    const { name, email, password, phone, vehicleType, address, currentLocation, isActive } = data;
    const formattedData: any = {};

    const normalizedPhone = phone !== undefined ? (phone.trim() ? normalizePhone(phone) : null) : undefined;

    if (email && email.toLowerCase() !== courier.user.email.toLowerCase()) {
      const existingEmail = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (existingEmail && existingEmail.id !== courier.userId) {
        throw new ConflictException(`Email '${email}' is already registered`);
      }
    }

    if (normalizedPhone) {
      const existingPhone = await prisma.user.findFirst({
        where: { phone: normalizedPhone, NOT: { id: courier.userId } },
      });
      if (existingPhone) {
        throw new ConflictException(`Phone number '${phone}' is already registered`);
      }
    }

    if (normalizedPhone !== undefined) formattedData.phone = normalizedPhone;
    if (vehicleType !== undefined) formattedData.vehicleType = vehicleType;
    if (address !== undefined) formattedData.address = address;
    if (currentLocation !== undefined) formattedData.currentLocation = currentLocation;
    if (isActive !== undefined) formattedData.isActive = isActive;

    const userUpdate: any = {};
    if (name !== undefined) userUpdate.name = name;
    if (email !== undefined) userUpdate.email = email.toLowerCase();
    if (normalizedPhone !== undefined) userUpdate.phone = normalizedPhone;
    if (isActive !== undefined) userUpdate.isActive = isActive;
    if (password) {
      userUpdate.passwordHash = await bcrypt.hash(password, 12);
    }

    if (Object.keys(userUpdate).length > 0) {
      formattedData.user = {
        update: userUpdate,
      };
    }

    return CourierRepository.update(id, formattedData);
  }
}
