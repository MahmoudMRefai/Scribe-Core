import { CourierRepository } from './courier.repository.js';
import { NotFoundException } from '../../shared/errors.js';
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

  static async update(id: string, data: { name?: string; phone?: string; password?: string; email?: string; vehicleType?: any; address?: string; isActive?: boolean }) {
    const courier = await CourierRepository.findById(id);
    if (!courier) throw new NotFoundException('Courier', id);

    const { name, email, password, phone, vehicleType, address, isActive } = data;
    const formattedData: any = { phone, vehicleType, address, isActive };

    if (name || email || password) {
      const userUpdate: any = {};
      if (name) userUpdate.name = name;
      if (email) userUpdate.email = email;
      if (password) userUpdate.passwordHash = await bcrypt.hash(password, 12);

      formattedData.user = {
        update: userUpdate,
      };
    }

    return CourierRepository.update(id, formattedData);
  }
}
