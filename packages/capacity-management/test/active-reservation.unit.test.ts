import { describe,it,expect,vi } from 'vitest';
import { CapacityReservationService,CapacityPlanService } from '../src/index.js';
describe('assertActiveReservation',()=>{
 it('locks only event-scoped reservation and accepts ACTIVE without mutation',async()=>{
  const query=vi.fn().mockResolvedValue([{status:'ACTIVE'}]);const execute=vi.fn();const runner={run:async(work:any)=>work({query,execute})};
  await new CapacityReservationService(runner,new CapacityPlanService(runner)).assertActiveReservation('event','reservation');
  expect(query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'),'event','reservation');expect(execute).not.toHaveBeenCalled();
 });
 it.each([[],[{status:'RELEASED'}],[{status:'COMMITTED'}]])('rejects absent or inactive reservation %j',async(rows)=>{
  const runner={run:async(work:any)=>work({query:async()=>rows,execute:vi.fn()})};
  await expect(new CapacityReservationService(runner,new CapacityPlanService(runner)).assertActiveReservation('event','reservation')).rejects.toBeDefined();
 });
});
