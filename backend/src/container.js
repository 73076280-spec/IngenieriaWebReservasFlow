import { Client, Employee, Service, Appointment, Slot, User, Notification, Tenant } from './models.js';
import { createTenantRepository } from './repositories/tenantScopedRepository.js';
import { createCatalogService } from './services/catalogService.js';
import { createAppointmentService } from './services/appointmentService.js';
import { createAvailabilityService } from './services/availabilityService.js';
import { createDashboardService } from './services/dashboardService.js';
import { createUserService } from './services/userService.js';
import { createSettingsService } from './services/settingsService.js';
import { createMailer } from './notifications/mailer.js';
import { createBookingNotifier } from './notifications/bookingConfirmation.js';

/**
 * Construye repositorios y servicios de negocio. No abre conexiones.
 * mail: configuración de correo (config/env.js); mailer: transporte ya construido (pruebas).
 */
export function createServices({ bcryptRounds = 12, mail, mailer = createMailer(mail || { transport: 'disabled' }) } = {}) {
  const repos = {
    clients: createTenantRepository(Client),
    employees: createTenantRepository(Employee),
    services: createTenantRepository(Service),
    appointments: createTenantRepository(Appointment),
    slots: createTenantRepository(Slot),
    users: createTenantRepository(User),
    notifications: createTenantRepository(Notification),
  };
  // La organización solo se lee o modifica con el tenantId de la sesión.
  const tenants = {
    findById: (id) => Tenant.findById(id).lean(),
    updateSettings: (id, s) => Tenant.findByIdAndUpdate(id, { $set: { 'settings.rescheduleMinHours': s.rescheduleMinHours } }, { new: true, runValidators: true }).lean(),
  };
  const availability = createAvailabilityService({ repos });
  const notifier = createBookingNotifier({ repos, mailer });
  return {
    mailer,
    catalog: createCatalogService({ repos }),
    availability,
    appointments: createAppointmentService({ repos, availability, notifier }),
    dashboard: createDashboardService({ repos }),
    users: createUserService({ repos, bcryptRounds }),
    settings: createSettingsService({ tenants }),
  };
}
