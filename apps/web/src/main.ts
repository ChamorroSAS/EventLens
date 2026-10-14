import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, appConfig).catch(() => {
  // Startup failures must not disclose configuration or network internals.
  console.error('No se pudo iniciar EventLens.');
});
