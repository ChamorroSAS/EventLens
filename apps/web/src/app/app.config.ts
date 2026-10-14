import { ApplicationConfig } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { providePublicEntryRouter } from './navigation/public-entry-router.service';
import { ALL_PUBLIC_ENTRY_ROUTES } from './navigation/all-routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding()),
    providePublicEntryRouter(ALL_PUBLIC_ENTRY_ROUTES),
  ],
};

