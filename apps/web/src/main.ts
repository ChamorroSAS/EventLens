import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { providePublicEntryRouter } from './app/navigation/public-entry-router.service';
import { ALL_PUBLIC_ENTRY_ROUTES } from './app/navigation/all-routes';

bootstrapApplication(AppComponent, {
  providers: [
    providePublicEntryRouter(ALL_PUBLIC_ENTRY_ROUTES)
  ]
}).catch(() => {
  // Startup failures must not disclose configuration or network internals.
  console.error('No se pudo iniciar EventLens.');
});
