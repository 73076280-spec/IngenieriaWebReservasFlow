import mongoose from 'mongoose';
const { Schema, model }=mongoose;
const common={tenantId:{type:Schema.Types.ObjectId,ref:'Tenant',required:true,index:true}};
export const ROLES=['admin','recepcionista','profesional','cliente'];
export const TENANT_STATUS=['activa','suspendida'];
export const APPOINTMENT_STATUS=['programada','confirmada','completada','cancelada','no_asistio'];

// slug: código legible para iniciar sesión (HU-15-E1). sparse: las organizaciones previas no lo tienen.
// status: el proveedor SaaS puede suspender una organización (HU-14-E4). Por defecto activa.
// settings.rescheduleMinHours: plazo mínimo para que un cliente reprograme (HU-05-E3).
const tenantSchema=new Schema({name:{type:String,required:true},slug:{type:String,lowercase:true,trim:true},status:{type:String,enum:TENANT_STATUS,default:'activa'},timezone:{type:String,default:'America/Lima'},settings:{rescheduleMinHours:{type:Number,min:0,max:72,default:2}}},{timestamps:true});
tenantSchema.index({slug:1},{unique:true,sparse:true});
export const Tenant=model('Tenant',tenantSchema);

// role sin valor por defecto: una cuenta sin rol queda pendiente de configuración (HU-11-E4).
// employeeId vincula al profesional con su perfil; clientId vincula al cliente con su ficha (portal del cliente).
const userSchema=new Schema({...common,name:{type:String,required:true},email:{type:String,required:true,lowercase:true,trim:true},passwordHash:{type:String,required:true},role:{type:String,enum:[...ROLES,null],default:null},employeeId:{type:Schema.Types.ObjectId,ref:'Employee'},clientId:{type:Schema.Types.ObjectId,ref:'Client'}},{timestamps:true});
userSchema.index({tenantId:1,email:1},{unique:true});
export const User=model('User',userSchema);

export const Client=model('Client',new Schema({...common,name:{type:String,required:true},email:String,phone:String,notes:String},{timestamps:true}));
// serviceIds vacío = atiende todos los servicios (compatibilidad con perfiles previos). active ausente = activo.
export const Employee=model('Employee',new Schema({...common,name:{type:String,required:true},specialty:String,serviceIds:{type:[{type:Schema.Types.ObjectId,ref:'Service'}],default:[]},active:{type:Boolean,default:true},/* 0=domingo; horas HH:mm en zona horaria configurada por tenant */ schedule:{type:[{day:Number,start:String,end:String}],default:[]}},{timestamps:true}));
export const Service=model('Service',new Schema({...common,name:{type:String,required:true},duration:{type:Number,required:true,min:15},price:{type:Number,required:true,min:0},active:{type:Boolean,default:true}},{timestamps:true}));
// __v se incrementa en cada cambio de estado o reprogramación para detectar modificaciones simultáneas (HU-06-E4).
const appointmentSchema=new Schema({...common,clientId:{type:Schema.Types.ObjectId,ref:'Client',required:true},employeeId:{type:Schema.Types.ObjectId,ref:'Employee',required:true},serviceId:{type:Schema.Types.ObjectId,ref:'Service',required:true},start:{type:Date,required:true},end:{type:Date,required:true},priceSnapshot:Number,status:{type:String,enum:APPOINTMENT_STATUS,default:'programada'},cancellationReason:String,cancelledAt:Date,cancelledBy:{type:Schema.Types.ObjectId,ref:'User'},
  // Confirmación por correo (HU-04-E1): estado del envío, sin datos del proveedor ni credenciales.
  notification:{status:{type:String,enum:['pendiente','enviada','simulada','fallida','sin_correo','desactivada']},to:String,attempts:Number,sentAt:Date,transport:String,messageId:String,lastError:String}},{timestamps:true});
appointmentSchema.index({tenantId:1,employeeId:1,start:1});
export const Appointment=model('Appointment',appointmentSchema);
// Locks atómicos por intervalos de 15 minutos; siempre dentro de transacción MongoDB.
const slotSchema=new Schema({...common,employeeId:{type:Schema.Types.ObjectId,required:true},at:{type:Date,required:true},appointmentId:{type:Schema.Types.ObjectId,required:true}});
slotSchema.index({tenantId:1,employeeId:1,at:1},{unique:true});
export const Slot=model('Slot',slotSchema);

// Tokens invalidados al cerrar sesión (HU-15-E2). MongoDB los borra solo cuando el token habría expirado.
const revokedSchema=new Schema({jti:{type:String,required:true},expiresAt:{type:Date,required:true}});
revokedSchema.index({jti:1},{unique:true});
revokedSchema.index({expiresAt:1},{expireAfterSeconds:0});
export const RevokedToken=model('RevokedToken',revokedSchema);

// Avisos para administradores de la organización, p. ej. cuentas sin rol (HU-11-E4).
const notificationSchema=new Schema({...common,type:{type:String,required:true},userId:{type:Schema.Types.ObjectId,ref:'User'},message:{type:String,required:true},read:{type:Boolean,default:false}},{timestamps:true});
notificationSchema.index({tenantId:1,type:1,userId:1},{unique:true});
export const Notification=model('Notification',notificationSchema);
