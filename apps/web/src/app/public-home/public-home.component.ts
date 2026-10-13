import { Component, inject } from '@angular/core';
import {
  APPROVED_PUBLIC_ENTRY_PATHS,
  CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA,
  type PublicEntryRouteDescriptor
} from '../navigation/public-entry-routes.contract';
import { PublicEntryRouterService } from '../navigation/public-entry-router.service';
import { AppHeaderComponent } from './app-header.component';
import { LegalFooterComponent } from './legal-footer.component';

@Component({
  selector: 'eventlens-public-home',
  standalone: true,
  imports: [AppHeaderComponent, LegalFooterComponent],
  templateUrl: './public-home.component.html',
  styleUrl: './public-home.component.scss'
})
export class PublicHomePageComponent {
  private readonly router = inject(PublicEntryRouterService, { optional: true });
  readonly betaPath = APPROVED_PUBLIC_ENTRY_PATHS.BETA_ACCESS;

  onNavigateToBeta(event: MouseEvent): void {
    if (!this.router) return;
    event.preventDefault();
    void this.router.navigateByUrl(APPROVED_PUBLIC_ENTRY_PATHS.BETA_ACCESS);
  }

  onScrollTo(event: MouseEvent, targetId: string): void {
    event.preventDefault();
    if (typeof document !== 'undefined') {
      const element = document.getElementById(targetId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
        element.focus();
      }
    }
  }
}

export const PUBLIC_HOME_ROUTE_DESCRIPTOR: PublicEntryRouteDescriptor = Object.freeze({
  ...CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA.PUBLIC_HOME,
  component: PublicHomePageComponent
});
