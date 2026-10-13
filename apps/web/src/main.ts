import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig).catch(() => {
  // Startup failures must not disclose configuration or network internals.
  console.error('No se pudo iniciar EventLens.');
});
