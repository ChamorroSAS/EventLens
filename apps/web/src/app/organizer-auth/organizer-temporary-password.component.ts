import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { createEventLensClient } from '@eventlens/api-client';
import { OrganizerSessionService } from '../organizer-session.service.js';

@Component({
  selector: 'eventlens-organizer-temporary-password', standalone: true, imports: [CommonModule],
  templateUrl: './organizer-temporary-password.component.html',
  styleUrl: './organizer-temporary-password.component.scss'
})
export class OrganizerTemporaryPasswordComponent implements OnInit, OnDestroy {
  readonly session=inject(OrganizerSessionService); private readonly router=inject(Router); private readonly client=createEventLensClient(); private alive=true;
  readonly currentPassword=signal(''); readonly newPassword=signal(''); readonly confirmation=signal(''); readonly declaredAdult=signal(false); readonly saving=signal(false); readonly checking=signal(true); readonly error=signal('');
  private readonly unregister=this.session.registerOrganizerCacheClearer(()=>{this.currentPassword.set('');this.newPassword.set('');this.confirmation.set('');});
  async ngOnInit(){const snapshot=await this.session.refreshSessionProjection();if(!this.alive)return;this.checking.set(false);if(snapshot.state==='ANONYMOUS')await this.router.navigateByUrl('/ingresar');else if(snapshot.state==='ORGANIZER_ACTIVE')await this.router.navigateByUrl('/mis-eventos');else if(snapshot.state!=='PASSWORD_CHANGE_REQUIRED')this.error.set('No se pudo confirmar el acceso para cambiar la contraseña.');}
  ngOnDestroy(){this.alive=false;this.unregister();this.currentPassword.set('');this.newPassword.set('');this.confirmation.set('');}
  value(event:Event){return(event.target as HTMLInputElement).value;}checked(event:Event){return(event.target as HTMLInputElement).checked;}
  async submit(event:Event){event.preventDefault();if(this.saving())return;this.error.set('');if(this.newPassword().length<8){this.error.set('La nueva contraseña debe tener al menos 8 caracteres.');return;}if(this.newPassword()!==this.confirmation()){this.error.set('Las contraseñas nuevas no coinciden.');return;}if(this.newPassword()===this.currentPassword()){this.error.set('Elige una contraseña distinta de la temporal.');return;}if(!this.declaredAdult()){this.error.set('Debes declarar que eres mayor de edad.');return;}this.saving.set(true);
    try{const{response}=await this.client.POST('/api/v1/organizer/session/temporary-password',{body:{currentPassword:this.currentPassword(),newPassword:this.newPassword(),declaredAdult:true},headers:{'X-CSRF-Token':this.session.getCsrfToken()??''}});if(!this.alive)return;if(response.ok){this.session.clearLocalSessionProjection();await this.router.navigateByUrl('/ingresar?passwordChanged=1',{replaceUrl:true});}else{this.error.set(response.status===503?'No se confirmó el cambio. Si no puedes ingresar, pide al administrador una nueva contraseña temporal.':response.status===401?'La sesión o contraseña temporal no es válida. Vuelve a ingresar.':'Revisa la contraseña actual y los requisitos de la nueva contraseña.');}}catch{if(this.alive)this.error.set('No se confirmó el cambio. Si no puedes ingresar, pide al administrador una nueva contraseña temporal.');}finally{this.currentPassword.set('');this.newPassword.set('');this.confirmation.set('');if(this.alive)this.saving.set(false);}
  }
  async logout(){const outcome=await this.session.logout();if(outcome.status==='CONFIRMED')await this.router.navigateByUrl('/ingresar');else this.error.set(outcome.message);}
}
