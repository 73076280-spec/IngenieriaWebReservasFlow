import { describe, it, expect } from 'vitest';
import { can, PERMISSIONS, appointmentScope, assertAppointmentVisible, allowedStatuses } from '../../src/services/policies.js';
import { User } from '../../src/models.js';

describe('Política RBAC centralizada', () => {
  it('ningún permiso se concede a un usuario sin rol', () => {
    for (const p of Object.keys(PERMISSIONS)) {
      expect(can(null, p)).toBe(false);
      expect(can(undefined, p)).toBe(false);
    }
  });

  it('el administrador tiene todos los permisos', () => {
    for (const p of Object.keys(PERMISSIONS)) expect(can('admin', p)).toBe(true);
  });

  it('HU-11-E1 recepción gestiona clientes (incluida su eliminación, HU-01) y citas, sin panel ni cuentas', () => {
    for (const p of ['clients:read', 'clients:write', 'clients:delete', 'appointments:read', 'appointments:create', 'appointments:status', 'appointments:reschedule']) expect(can('recepcionista', p)).toBe(true);
    for (const p of ['dashboard:read', 'users:manage', 'settings:manage', 'employees:write', 'services:write']) expect(can('recepcionista', p)).toBe(false);
  });

  it('HU-11-E3 el cliente no accede al panel ni al listado de clientes', () => {
    expect(can('cliente', 'dashboard:read')).toBe(false);
    expect(can('cliente', 'clients:read')).toBe(false);
  });

  it('portal del cliente: consulta disponibilidad y reserva, reprograma y cancela; solo puede cancelar', () => {
    for (const p of ['availability:read', 'appointments:read', 'appointments:create', 'appointments:reschedule', 'appointments:status']) expect(can('cliente', p)).toBe(true);
    for (const p of ['clients:write', 'employees:write', 'services:write', 'users:manage']) expect(can('cliente', p)).toBe(false);
    expect(allowedStatuses('cliente')).toEqual(['cancelada']);
    expect(allowedStatuses('profesional')).toEqual(['confirmada', 'completada', 'no_asistio']);
    expect(allowedStatuses('recepcionista')).toBeNull();
  });

  it('el cliente solo ve sus citas; sin ficha vinculada no ve ninguna', () => {
    expect(appointmentScope({ role: 'cliente', clientId: 'c1' })).toEqual({ clientId: 'c1' });
    expect(appointmentScope({ role: 'cliente', clientId: null })).toBeNull();
    expect(() => assertAppointmentVisible({ role: 'cliente', clientId: 'c1' }, { clientId: 'c2' })).toThrow(expect.objectContaining({ status: 404 }));
    expect(() => assertAppointmentVisible({ role: 'cliente', clientId: 'c1' }, { clientId: { _id: 'c1' } })).not.toThrow();
  });

  it('un permiso inexistente es un error de programación', () => {
    expect(() => can('admin', 'algo:raro')).toThrow();
  });

  it('el profesional solo ve sus citas; sin perfil vinculado no ve ninguna', () => {
    expect(appointmentScope({ role: 'profesional', employeeId: 'e1' })).toEqual({ employeeId: 'e1' });
    expect(appointmentScope({ role: 'profesional', employeeId: null })).toBeNull();
    expect(appointmentScope({ role: 'recepcionista' })).toEqual({});
    expect(() => assertAppointmentVisible({ role: 'profesional', employeeId: 'e1' }, { employeeId: 'e2' })).toThrow(expect.objectContaining({ status: 404 }));
    expect(() => assertAppointmentVisible({ role: 'profesional', employeeId: 'e1' }, { employeeId: { _id: 'e1' } })).not.toThrow();
  });

  it('HU-11-E4 el modelo de usuario no asigna rol administrador por defecto', () => {
    const u = new User({ tenantId: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Nuevo', email: 'n@x.test', passwordHash: 'h' });
    expect(u.role).toBeNull();
    expect(u.validateSync()).toBeUndefined();
  });
});
