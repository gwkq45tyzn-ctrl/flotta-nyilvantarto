/**
 * Next-day depot forecast. Read-only calculation from already authorized
 * Firestore snapshots. Aggregates are not proof of unique parcel identities.
 */
import {summarizeDistrictCapacity} from './district-capacity.mjs';
import {assessBooking} from './capacity-eligibility.mjs';

const validDate=value=>{
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(String(value??'')))return false;
  const d=new Date(value+'T12:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
};
const validCapacity=value=>Number.isSafeInteger(value)&&value>=0&&value<=10000;
const normalizedDistrict=value=>String(value??'').trim().toLocaleUpperCase('hu-HU').replaceAll('/','-');
export function followingDay(baseDate){
  if(!validDate(baseDate))throw Error('Érvénytelen tervezési dátum.');
  const d=new Date(baseDate+'T12:00:00Z');
  d.setUTCDate(d.getUTCDate()+1);
  return d.toISOString().slice(0,10);
}

export function prepareNextDay({
  baseDate,today=baseDate,demands=[],bookings=[],drivers=[],vehicles=[],sourcesReady=false
}={}){
  const date=followingDay(baseDate);
  if(!validDate(today))throw Error('Érvénytelen mai dátum.');
  const plan=summarizeDistrictCapacity({date,today,demands,bookings,drivers,vehicles});
  const dayBookings=bookings.filter(b=>b.date===date);
  const driverUse=new Map(),vehicleUse=new Map();
  for(const b of dayBookings){
    if(b.driverId)driverUse.set(b.driverId,(driverUse.get(b.driverId)||0)+1);
    if(b.vehicleId)vehicleUse.set(b.vehicleId,(vehicleUse.get(b.vehicleId)||0)+1);
  }
  const confirmedByDistrict=new Map(),confirmedIds=new Set();
  let pendingCount=0,invalidBookingCount=0,confirmedCouriers=0;
  for(const b of dayBookings){
    const d=normalizedDistrict(b.district);
    const eligible=Boolean(b.id&&b.driverId&&b.vehicleId&&d&&
      driverUse.get(b.driverId)===1&&vehicleUse.get(b.vehicleId)===1&&
      validCapacity(b.capacity)&&assessBooking(b,drivers,vehicles,today).eligible);
    if(!eligible){invalidBookingCount++;continue;}
    if(b.status==='confirmed'){
      confirmedByDistrict.set(d,(confirmedByDistrict.get(d)||0)+b.capacity);
      confirmedIds.add(b.driverId);
    }else pendingCount++;
  }
  confirmedCouriers=confirmedIds.size;
  const ready=Boolean(sourcesReady);
  const rows=plan.rows.map(x=>{
    const confirmed=ready?(confirmedByDistrict.get(x.district)||0):null;
    const planned=ready?x.capacity:null;
    const demand=ready?x.demand:null;
    const valid=ready&&x.hasDemand;
    const plannedGap=valid?planned-demand:null;
    const confirmedGap=valid?confirmed-demand:null;
    return {...x,
      demand:valid?demand:null,
      newCount:valid?x.newCount:null,
      retryCount:valid?x.retryCount:null,
      plannedCapacity:planned,confirmedCapacity:confirmed,
      plannedGap,confirmedGap,
      missingPlanned:plannedGap===null?null:Math.max(0,-plannedGap),
      missingConfirmed:confirmedGap===null?null:Math.max(0,-confirmedGap)
    };
  });
  const demandComplete=ready&&plan.hasCompleteDemand;
  const anyShortfall=rows.some(x=>x.missingPlanned!==null&&x.missingPlanned>0);
  const hasUnconfirmed=rows.some(x=>x.missingConfirmed!==null&&x.missingConfirmed>0);
  const status=!ready?'unavailable':!demandComplete?'incomplete':
    anyShortfall?'shortage':(hasUnconfirmed||pendingCount||invalidBookingCount||plan.issues.length)?
    'needs_confirmation':'ready';
  const totalConfirmed=rows.reduce((sum,x)=>sum+(x.confirmedCapacity??0),0);
  return {
    date,status,rows,
    demandVerifiedByParcel:false,
    totalNew:demandComplete?plan.totalNew:null,
    totalRetry:demandComplete?plan.totalRetry:null,
    totalDemand:demandComplete?plan.totalDemand:null,
    plannedCapacity:ready?plan.totalCapacity:null,
    confirmedCapacity:ready?totalConfirmed:null,
    plannedGap:demandComplete?plan.gap:null,
    confirmedGap:demandComplete?totalConfirmed-plan.totalDemand:null,
    pendingCount:ready?pendingCount:null,
    confirmedCouriers:ready?confirmedCouriers:null,
    invalidBookingCount:ready?invalidBookingCount:null,
    issues:plan.issues,
    missingDemandDistricts:ready?rows.filter(x=>!x.hasDemand).map(x=>x.district):[],
    sourceReady:ready
  };
}
