import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { createEventLensClient } from '@eventlens/api-client';
import { OrganizerSessionService } from '../organizer-session.service.js';

@Component({
  selector: 'eventlens-organizer-temporary-password', standalone: true, imports: [CommonModule],
  template: `
    <main aria-labelledby="password-change-title"><section class="card"><p class="eyebrow">Phoeve · Primer ingreso</p><h1 id="password-change-title">Cambia tu contraseña</h1><p>Tu acceso está limitado hasta elegir una contraseña personal. La contraseña temporal dejará de funcionar y volverás a ingresar con la nueva.</p>
      @if (checking()) { <p role="status">Comprobando tu sesión…</p> }
      @if (error()) { <p id="password-change-error" role="alert" class="error">{{ error() }}</p> }
      @if (session.state() === 'PASSWORD_CHANGE_REQUIRED') {
      <form novalidate (submit)="submit($event)">
        <label for="password-change-current">Contraseña temporal actual</label><input id="password-change-current" type="password" autocomplete="current-password" required [value]="currentPassword()" (input)="currentPassword.set(value($event))" [disabled]="saving()" [attr.aria-invalid]="error() ? true : null" [attr.aria-describedby]="error() ? 'password-change-error' : null" />
        <label for="password-change-new">Nueva contraseña</label><input id="password-change-new" type="password" autocomplete="new-password" required minlength="8" maxlength="1024" [value]="newPassword()" (input)="newPassword.set(value($event))" [disabled]="saving()" [attr.aria-invalid]="error() ? true : null" [attr.aria-describedby]="error() ? 'password-change-error password-policy' : 'password-policy'" /><small id="password-policy">Usa al menos 8 caracteres y una contraseña distinta de la temporal.</small>
        <label for="password-change-confirm">Confirma la nueva contraseña</label><input id="password-change-confirm" type="password" autocomplete="new-password" required [value]="confirmation()" (input)="confirmation.set(value($event))" [disabled]="saving()" [attr.aria-invalid]="error() ? true : null" [attr.aria-describedby]="error() ? 'password-change-error' : null" />
        <label class="adult"><input id="password-change-adult" type="checkbox" [checked]="declaredAdult()" (change)="declaredAdult.set(checked($event))" [disabled]="saving()" required [attr.aria-invalid]="error() ? true : null" [attr.aria-describedby]="error() ? 'password-change-error' : null" /> Declaro que soy mayor de edad.</label>
        <button type="submit" class="primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar contraseña' }}</button>
      </form>
      }
      <button (click)="logout()" [disabled]="saving() || checking()">Cerrar sesión</button>
    </section></main>
  `,
  styles: [`main{min-height:90vh;display:grid;place-items:center;padding:1.25rem;color:var(--el-color-text);background:var(--el-color-background);font-family:var(--el-font-family)}.card{width:min(100%,30rem);box-sizing:border-box;padding:2rem;border:1px solid var(--el-color-border);border-radius:1rem;background:var(--el-color-surface)}h1{font-size:1.5rem}p,small{line-height:1.5}.eyebrow,small{color:var(--el-color-text-secondary)}label{display:block;margin:1rem 0 .35rem;font-weight:500}input:not([type=checkbox]){width:100%;box-sizing:border-box;padding:.75rem;border:1px solid var(--el-color-border);border-radius:.5rem;font:inherit;background:var(--el-color-surface);color:var(--el-color-text)}small{display:block;margin-top:.35rem}.adult{display:flex;align-items:center;gap:.75rem;margin:1.25rem 0}.adult input{width:1.2rem;height:1.2rem}button{min-height:2.75rem;padding:.65rem 1rem;border:1px solid var(--el-color-border);border-radius:.5rem;background:var(--el-color-surface);color:var(--el-color-text);font:inherit;margin-top:1rem;cursor:pointer}button.primary{background:var(--el-color-primary);color:#fff;width:100%}button:disabled{opacity:.6;cursor:default}input:focus-visible,button:focus-visible{outline:2px solid var(--el-color-primary);outline-offset:3px}.error{padding:.75rem;border:1px solid var(--el-color-danger,#c94a4a);border-radius:.5rem}@media(max-width:639px){.card{padding:1.25rem}}`]
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
