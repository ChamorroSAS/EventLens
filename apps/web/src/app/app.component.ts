import { Component } from '@angular/core';
import { PublicEntryRouterOutletComponent } from './navigation/public-entry-router.service';

@Component({
  selector: 'eventlens-root',
  standalone: true,
  imports: [PublicEntryRouterOutletComponent],
  template: `
    <eventlens-router-outlet></eventlens-router-outlet>
  `
})
export class AppComponent {}
