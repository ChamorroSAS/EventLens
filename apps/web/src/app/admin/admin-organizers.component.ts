import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AdminConsoleShellComponent } from './admin-console-shell.component.js';
import { AdminSessionService } from './admin-session.service.js';
import { AdminOrganizersApiService, type OrganizerSummary } from './admin-organizers-api.service.js';

@Component({
  selector: 'eventlens-admin-organizers', standalone: true, imports: [CommonModule, RouterLink, AdminConsoleShellComponent],
  template: `
    <eventlens-admin-console-shell activeNav="organizadores">
      <section class="organizers" aria-labelledby="organizers-title">
        <h1 id="organizers-title">Organizadores Beta</h1>
      @if (session.state() === 'ADMIN_ACTIVE' && !session.isRevalidating()) {
        <section class="toolbar"><div><h2>Acceso a la Beta</h2><p>Crea cuentas y administra su acceso. Los eventos se conservan al deshabilitar una cuenta.</p></div><button class="primary" (click)="openCreate()">Crear organizador</button></section>
        <form class="search" (submit)="search($event)"><label for="organizer-search">Buscar por correo o nombre</label><div><input id="organizer-search" [value]="query()" (input)="query.set(value($event))" maxlength="200" /><button type="submit" [disabled]="loading()">Buscar</button></div></form>
        @if (notice()) { <p role="status" class="notice">{{ notice() }}</p> }
        @if (error()) { <div role="alert" class="error">{{ error() }} <button (click)="load()" [disabled]="loading()">Recargar lista</button></div> }
        @if (loading()) { <p role="status">Cargando organizadores…</p> }
        @else if (items().length === 0) { <section class="empty"><h2>{{ query() ? 'Sin coincidencias' : 'Todavía no hay organizadores' }}</h2><p>{{ query() ? 'Prueba con otro correo o nombre.' : 'Crea la primera cuenta para comenzar la Beta.' }}</p></section> }
        @else {
          <div class="table"><table><thead><tr><th>Organizador</th><th>Acceso</th><th>Contraseña</th><th>Acciones</th></tr></thead><tbody>
          @for (organizer of items(); track organizer.id) { <tr><td data-label="Organizador"><strong>{{ organizer.displayName || 'Sin nombre' }}</strong><span>{{ organizer.email }}</span><small>{{ organizer.emailVerified ? 'Correo verificado' : 'Correo sin verificar' }}</small></td><td data-label="Acceso"><span class="badge">{{ statusLabel(organizer.status) }}</span></td><td data-label="Contraseña">{{ organizer.passwordChangeRequired ? 'Cambio obligatorio pendiente' : 'Personal' }}</td><td data-label="Acciones"><button (click)="openManage(organizer)" [attr.aria-label]="'Gestionar cuenta de ' + organizer.email">Gestionar cuenta</button></td></tr> }
          </tbody></table></div>
          <footer class="pagination"><span>{{ offset() + 1 }}–{{ offset() + items().length }} de {{ total() }}</span><div><button (click)="paginate(-20)" [disabled]="offset() === 0 || loading()">Anterior</button><button (click)="paginate(20)" [disabled]="offset() + items().length >= total() || loading()">Siguiente</button></div></footer>
        }
      } @else { <section class="empty"><p role="status">{{ session.state() === 'UNAVAILABLE' ? 'El acceso administrativo no está disponible.' : 'Comprobando la sesión administrativa…' }}</p><a routerLink="/admin/ingresar" [queryParams]="{returnUrl: '/admin/organizadores'}">Volver al acceso administrativo</a><button (click)="retrySession()">Reintentar</button></section> }
      <dialog #editor (cancel)="cancelDialog($event)" (close)="clearDialog()" aria-labelledby="organizer-dialog-title">
        <h2 id="organizer-dialog-title">{{ mode() === 'create' ? 'Crear organizador' : mode() === 'secret' ? 'Credencial temporal' : 'Gestionar cuenta' }}</h2>
        @if (mode() === 'secret') {
          <p>{{ secretEmail() }}</p><p>Guarda esta contraseña para entregarla al organizador. No volverá a mostrarse. Esta vista se cerrará en un minuto.</p>
          <label for="temporary-password">Contraseña temporal</label><input id="temporary-password" [type]="showSecret() ? 'text' : 'password'" [value]="temporaryPassword()" readonly autocomplete="off" />
          <div class="actions"><button (click)="toggleSecret()">{{ showSecret() ? 'Ocultar' : 'Mostrar' }}</button><button (click)="copyPassword()">Copiar contraseña</button></div>
          <p>Vence: {{ secretExpiresAt() | date:'medium' }}</p><p>El organizador debe ingresar y cambiarla antes de gestionar eventos.</p><p role="status">{{ copied() }}</p><button class="primary" (click)="closeDialog()">Ya guardé la credencial</button>
        } @else {
          <form (submit)="save($event)">
            @if (dialogError()) { <p class="error" role="alert" id="organizer-form-error">{{ dialogError() }}</p> }
            <label for="organizer-email">Correo de ingreso</label><input id="organizer-email" type="email" required maxlength="254" [value]="email()" (input)="edit('email', $event)" [readonly]="mode() !== 'create'" [disabled]="saving()" [attr.aria-invalid]="dialogError() ? true : null" [attr.aria-describedby]="dialogError() ? 'organizer-form-error' : null" />
            @if (mode() === 'manage') { <small>El correo identifica la cuenta y no se modifica aquí.</small> }
            <label for="organizer-name">Nombre (opcional)</label><input id="organizer-name" maxlength="120" [value]="name()" (input)="edit('name', $event)" [disabled]="saving()" [attr.aria-invalid]="dialogError() ? true : null" [attr.aria-describedby]="dialogError() ? 'organizer-form-error' : null" />
            <label for="organizer-reason">Motivo de la operación</label><textarea id="organizer-reason" required maxlength="500" [value]="reason()" (input)="edit('reason', $event)" [disabled]="saving()" [attr.aria-invalid]="dialogError() ? true : null" [attr.aria-describedby]="dialogError() ? 'organizer-form-error' : null"></textarea>
            @if (mode() === 'manage') {
              <p>Acceso: {{ statusLabel(selected()?.status ?? '') }}. {{ selected()?.passwordChangeRequired ? 'El cambio de contraseña sigue pendiente.' : '' }}</p>
              @if (confirmAction()) { <section class="confirm" role="alert"><h3>Confirmar {{ actionLabel(confirmAction()) }}</h3><p>{{ confirmAction() === 'disable' ? 'El organizador no podrá acceder. Sus eventos se conservan.' : confirmAction() === 'enable' ? 'Se habilitará el acceso. No se omite el cambio de contraseña pendiente.' : 'La contraseña anterior dejará de funcionar y todas las sesiones se cerrarán. El estado de acceso se conserva.' }}</p><div class="actions"><button type="button" class="primary" (click)="executeAction()" [disabled]="saving()">Confirmar</button><button type="button" (click)="confirmAction.set(null)" [disabled]="saving()">Cancelar acción</button></div></section> }
              @else { <div class="actions">@if (selected()?.status === 'ACTIVE' || selected()?.status === 'SUSPENDED') { <button type="button" (click)="askAction(selected()?.status === 'ACTIVE' ? 'disable' : 'enable')" [disabled]="saving()">{{ selected()?.status === 'ACTIVE' ? 'Deshabilitar acceso' : 'Habilitar acceso' }}</button> }@if (selected()?.provisioningSource === 'ADMIN_PROVISIONED' && (selected()?.status === 'ACTIVE' || selected()?.status === 'SUSPENDED')) { <button type="button" (click)="askAction('temporary-password')" [disabled]="saving()">Generar nueva contraseña temporal</button> }</div> }
            }
            <div class="actions"><button class="primary" type="submit" [disabled]="saving() || !!confirmAction()">{{ saving() ? 'Guardando…' : mode() === 'create' ? 'Crear cuenta' : 'Guardar nombre' }}</button><button type="button" (click)="closeDialog()" [disabled]="saving()">{{ mode() === 'create' ? 'Cancelar' : 'Cerrar' }}</button></div>
          </form>
        }
      </dialog>
      </section>
    </eventlens-admin-console-shell>
  `,
  styles: [`
    :host { display:block; } .organizers{max-width:72rem;margin:auto;padding:1.5rem;color:var(--el-color-text);font-family:var(--el-font-family)} .top,.toolbar,.pagination{display:flex;align-items:center;justify-content:space-between;gap:1rem}.top{border-bottom:1px solid var(--el-color-border);padding-bottom:1rem}.eyebrow,small{color:var(--el-color-text-secondary)}h1{font-size:clamp(1.5rem,4vw,2rem);margin:0}h2{font-size:1.25rem}nav{display:flex;gap:1.5rem;padding:1rem 0}nav a{color:var(--el-color-text);text-decoration:none;padding:.5rem 0}nav a[aria-current]{border-bottom:3px solid var(--el-color-primary);font-weight:600}.toolbar{margin:1rem 0}.toolbar p{max-width:38rem;color:var(--el-color-text-secondary)}button,input,textarea{font:inherit}button{min-height:2.75rem;padding:.55rem 1rem;border:1px solid var(--el-color-border);border-radius:.5rem;background:var(--el-color-surface);color:var(--el-color-text);cursor:pointer}button.primary{background:var(--el-color-primary);color:#fff;border-color:var(--el-color-primary)}button:disabled{opacity:.6;cursor:default}button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--el-color-primary);outline-offset:3px}input,textarea{width:100%;box-sizing:border-box;padding:.7rem;border:1px solid var(--el-color-border);border-radius:.5rem;background:var(--el-color-surface);color:var(--el-color-text)}label{display:block;font-weight:500;margin:.9rem 0 .35rem}.search{max-width:36rem;margin:1rem 0}.search div{display:flex;gap:.75rem}.table{border:1px solid var(--el-color-border);border-radius:.75rem;overflow:hidden}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:1rem;border-bottom:1px solid var(--el-color-border)}th{background:var(--el-color-surface-muted,#f4f4f1)}td span,td small{display:block;margin-top:.25rem;overflow-wrap:anywhere}.badge{font-size:.875rem}.pagination{padding:1rem 0}.pagination div,.actions{display:flex;gap:.75rem;flex-wrap:wrap}.empty{border:1px solid var(--el-color-border);padding:2rem;border-radius:.75rem}.error,.notice,.confirm{padding:1rem;background:var(--el-color-surface-muted,#f4f4f1);border:1px solid var(--el-color-border);border-radius:.5rem}.error{border-color:var(--el-color-danger,#c94a4a)}dialog{width:min(32rem,calc(100vw - 3rem));max-height:85dvh;overflow:auto;border:1px solid var(--el-color-border);border-radius:1rem;padding:1.5rem;color:var(--el-color-text);background:var(--el-color-surface)}dialog::backdrop{background:rgba(23,32,42,.45)}dialog .actions{margin-top:1rem}.confirm{margin-top:1rem}textarea{min-height:5rem}small{display:block;margin:.3rem 0}@media(max-width:639px){.organizers{padding:1rem}.top,.toolbar{align-items:stretch;flex-direction:column}.table,table,tbody,tr,td{display:block}thead{display:none}tr{padding:.75rem;border-bottom:1px solid var(--el-color-border)}td{padding:.4rem 0;border:0}td::before{content:attr(data-label);display:block;font-size:.8rem;color:var(--el-color-text-secondary)}.pagination{align-items:stretch;flex-direction:column}dialog{margin:auto auto 0;width:100%;max-height:90dvh;box-sizing:border-box;border-radius:1rem 1rem 0 0}}`
  ]
})
export class AdminOrganizersComponent implements OnInit, OnDestroy {
  readonly session = inject(AdminSessionService); private readonly api = inject(AdminOrganizersApiService); private readonly router = inject(Router);
  @ViewChild('editor') private editor?: ElementRef<HTMLDialogElement>;
  readonly items = signal<OrganizerSummary[]>([]); readonly total = signal(0); readonly offset = signal(0); readonly query = signal(''); readonly loading = signal(false); readonly error = signal(''); readonly notice = signal('');
  readonly mode = signal<'create'|'manage'|'secret'>('create'); readonly selected = signal<OrganizerSummary|null>(null); readonly email = signal(''); readonly name = signal(''); readonly reason = signal(''); readonly saving = signal(false); readonly dialogError = signal(''); readonly confirmAction = signal<'disable'|'enable'|'temporary-password'|null>(null);
  readonly temporaryPassword = signal(''); readonly secretEmail = signal(''); readonly secretExpiresAt = signal<string|null>(null); readonly showSecret = signal(false); readonly copied = signal('');
  private alive = true; private loadGeneration = 0; private key = crypto.randomUUID(); private trigger: HTMLElement|null = null;
  private secretTimer: ReturnType<typeof setTimeout>|undefined;
  private readonly unregister = this.session.registerPrivateCacheClearer(() => { this.items.set([]); this.total.set(0); this.clearDialog(); this.editor?.nativeElement.close(); this.loadGeneration++; });
  ngOnInit() { if (this.session.state() === 'ADMIN_ACTIVE') void this.load(); }
  ngOnDestroy() { this.alive = false; this.unregister(); this.clearDialog(); }
  value(event: Event): string { return (event.target as HTMLInputElement).value; }
  statusLabel(status: string): string { return ({ACTIVE:'Habilitado',SUSPENDED:'Deshabilitado',PENDING_VERIFICATION:'Verificación pendiente',PENDING_DELETION:'Eliminación pendiente',DELETED:'Eliminado',REVOKED:'Revocado'} as Record<string,string>)[status] ?? status; }
  actionLabel(action: string|null): string { return action === 'disable' ? 'deshabilitación' : action === 'enable' ? 'habilitación' : 'nueva contraseña temporal'; }
  async load() { const generation = ++this.loadGeneration; this.loading.set(true); this.error.set(''); try { const page = await this.api.list(this.query().trim(),this.offset()); if (!this.alive || generation !== this.loadGeneration) return; this.items.set(page.items); this.total.set(page.total); } catch(e) { if(this.alive && generation === this.loadGeneration) this.error.set(e instanceof Error ? e.message : 'No se pudo cargar la lista.'); } finally { if (this.alive && generation === this.loadGeneration) this.loading.set(false); } }
  search(event: Event) { event.preventDefault(); this.offset.set(0); void this.load(); }
  paginate(amount:number) { this.offset.update(value=>Math.max(0,value+amount)); void this.load(); }
  private open() { this.trigger = document.activeElement as HTMLElement; this.key=crypto.randomUUID(); this.dialogError.set(''); this.confirmAction.set(null); this.editor?.nativeElement.showModal(); }
  openCreate() { this.mode.set('create'); this.selected.set(null); this.email.set(''); this.name.set(''); this.reason.set(''); this.open(); }
  openManage(organizer:OrganizerSummary) { this.mode.set('manage'); this.selected.set(organizer); this.email.set(organizer.email); this.name.set(organizer.displayName ?? ''); this.reason.set(''); this.open(); }
  edit(field:'email'|'name'|'reason',event:Event) { this[field].set(this.value(event)); this.key=crypto.randomUUID(); this.dialogError.set(''); }
  closeDialog() { if(this.saving()) return; this.editor?.nativeElement.close(); this.clearDialog(); this.trigger?.focus(); }
  clearDialog() { clearTimeout(this.secretTimer); this.secretTimer=undefined; this.temporaryPassword.set(''); this.secretEmail.set(''); this.secretExpiresAt.set(null); this.showSecret.set(false); this.copied.set(''); this.confirmAction.set(null); this.selected.set(null); this.email.set(''); this.name.set(''); this.reason.set(''); }
  cancelDialog(event:Event) { event.preventDefault(); this.closeDialog(); }
  async toggleSecret() { if(this.showSecret()){this.showSecret.set(false);return;} const snapshot=await this.session.refreshSession(); if(this.alive && snapshot.state==='ADMIN_ACTIVE' && this.temporaryPassword()) this.showSecret.set(true); else this.clearDialog(); }
  async copyPassword() { const snapshot=await this.session.refreshSession(); if(!this.alive || snapshot.state!=='ADMIN_ACTIVE' || !this.temporaryPassword()) {this.clearDialog();return;} try { await navigator.clipboard.writeText(this.temporaryPassword()); if(this.alive) this.copied.set('Contraseña copiada.'); } catch { this.copied.set('No se pudo copiar. Puedes seleccionar la contraseña manualmente.'); } }
  askAction(action:'disable'|'enable'|'temporary-password') { this.confirmAction.set(action); this.dialogError.set(''); this.key=crypto.randomUUID(); }
  async save(event:Event) { event.preventDefault(); if(this.saving() || this.confirmAction()) return; await this.mutate(); }
  async executeAction() { if(!this.saving()) await this.mutate(this.confirmAction() ?? undefined); }
  private async mutate(action?:'disable'|'enable'|'temporary-password') {
    if(!this.reason().trim()) { this.dialogError.set('Escribe un motivo para esta operación.'); return; }
    this.saving.set(true); this.dialogError.set('');
    try {
      const common={reason:this.reason().trim(),idempotencyKey:this.key}; const selected=this.selected();
      const result = this.mode()==='create' ? await this.api.create({...common,email:this.email().trim(),displayName:this.name().trim()}) : selected ? action ? await this.api.action(selected.id,action,{...common,expectedRevision:selected.revision}) : await this.api.update(selected.id,{...common,displayName:this.name().trim(),expectedRevision:selected.revision}) : null;
      if(!this.alive || this.session.state()!=='ADMIN_ACTIVE' || !result) return;
      this.key=crypto.randomUUID(); this.selected.set(result.organizer); this.confirmAction.set(null);
      if(result.temporaryPassword) { this.mode.set('secret'); this.temporaryPassword.set(result.temporaryPassword); this.secretEmail.set(result.organizer.email); this.secretExpiresAt.set(result.organizer.temporaryPasswordExpiresAt); clearTimeout(this.secretTimer); this.secretTimer=setTimeout(()=>{if(this.alive){this.editor?.nativeElement.close();this.clearDialog();this.notice.set('La credencial se ocultó por seguridad. Si no la guardaste, genera una nueva contraseña temporal desde la cuenta.');}},60000); }
      else { this.notice.set(result.outcome === 'IDEMPOTENT_REPLAY' ? 'La operación ya estaba registrada. Si necesitas una contraseña temporal, genera una nueva desde la cuenta.' : 'Cuenta actualizada.'); this.editor?.nativeElement.close(); this.clearDialog(); }
      void this.load();
    } catch(e) { if(this.alive) this.dialogError.set(e instanceof Error ? e.message : 'No se confirmó la operación.'); }
    finally { if(this.alive) this.saving.set(false); }
  }
  async logout() { await this.session.logout(); await this.router.navigateByUrl('/admin/ingresar'); }
  async retrySession() { if(this.session.logoutUncertainty()) await this.session.retryLogout(); else await this.session.refreshSession(); if(this.session.state()==='ADMIN_ACTIVE') await this.load(); }
}
