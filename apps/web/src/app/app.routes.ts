import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'guest',
    loadComponent: () =>
      import('./guest/guest-container.component').then((m) => m.GuestContainerComponent),
  },
  {
    path: 'organizer',
    loadComponent: () =>
      import('./organizer/organizer-dashboard.component').then((m) => m.OrganizerDashboardComponent),
  },
  {
    path: 'admin',
    loadComponent: () => import('./admin/admin-app-shell.component').then((m) => m.AdminAppShellComponent),
  },
  {
    path: 'gallery/:eventId',
    loadComponent: () => import('./gallery/gallery.component').then((m) => m.GalleryComponent),
  },
  {
    path: 'upload',
    loadComponent: () =>
      import('./upload/upload-container.component').then((m) => m.UploadContainerComponent),
  },
  { path: '**', redirectTo: '' },
];
