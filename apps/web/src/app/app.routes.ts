import type { Routes } from '@angular/router';
import { CreateEventFormComponent } from './events/create-event-form.component.js';
import { PlatformStatusComponent } from './platform-status.component.js';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: PlatformStatusComponent },
  { path: 'events/new', component: CreateEventFormComponent },
  { path: '**', redirectTo: '' },
];
