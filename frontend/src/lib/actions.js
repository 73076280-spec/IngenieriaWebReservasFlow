import Swal from 'sweetalert2';
import { toast } from 'react-toastify';
import { ACTION_LABEL } from './appointments.js';
import { notifyError } from '../components/ui.jsx';

/**
 * Confirmación previa al cambio de estado. La cancelación pide un motivo opcional de la
 * lista (HU-06-E1/E2); los estados finales piden confirmación. null = el usuario desistió.
 */
async function confirmChange(status, reasons) {
  if (status === 'cancelada') {
    const r = await Swal.fire({
      icon: 'question',
      title: '¿Cancelar la cita?',
      text: 'El horario quedará libre para otras reservas.',
      input: 'select',
      inputOptions: { '': 'Sin motivo', ...reasons },
      inputLabel: 'Motivo de cancelación',
      showCancelButton: true,
      confirmButtonText: 'Sí, cancelar cita',
      cancelButtonText: 'Volver',
      confirmButtonColor: '#b91c1c',
    });
    if (!r.isConfirmed) return null;
    return r.value ? { reason: r.value } : {};
  }
  if (status === 'no_asistio' || status === 'completada') {
    const label = status === 'completada' ? 'completada' : 'no asistió';
    const r = await Swal.fire({ icon: 'question', title: `¿Marcar la cita como "${label}"?`, text: 'Este estado es final y no podrá modificarse.', showCancelButton: true, confirmButtonText: ACTION_LABEL[status], cancelButtonText: 'Volver' });
    return r.isConfirmed ? {} : null;
  }
  return {};
}

/**
 * Cambio de estado de una cita con control de concurrencia (HU-06, HU-10).
 * Devuelve true si hay que recargar la información (cambio aplicado o cita modificada por otro).
 */
export async function changeStatus(api, appointment, status, reasons = {}) {
  const extra = await confirmChange(status, reasons);
  if (!extra) return false;
  try {
    await api(`/appointments/${appointment._id}/status`, { method: 'PATCH', body: JSON.stringify({ status, version: appointment.__v, ...extra }) });
    toast.success(status === 'cancelada' ? 'Cita cancelada' : 'Estado actualizado');
    return true;
  } catch (err) {
    // HU-06-E4: otro usuario la modificó; se avisa y se recarga la información.
    if (err.code === 'APPOINTMENT_UPDATED') {
      await Swal.fire({ icon: 'warning', title: 'La cita ya fue actualizada', text: err.message });
      return true;
    }
    if (err.status === 409) await Swal.fire({ icon: 'error', title: 'No es posible aplicar el cambio', text: err.message });
    else notifyError(err);
    return false;
  }
}
