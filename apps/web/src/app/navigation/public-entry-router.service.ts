import {
  Component,
  DOCUMENT,
  EnvironmentProviders,
  Injectable,
  InjectionToken,
  OnDestroy,
  inject,
  makeEnvironmentProviders,
  computed,
  signal
} from '@angular/core';
import { Location, NgComponentOutlet } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { Router, NavigationEnd, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import {
  APPROVED_PUBLIC_ENTRY_PATHS,
  PUBLIC_HOME_ANCHORS,
  type PublicEntryRouteActivationContext,
  type PublicEntryRouteDescriptor
} from './public-entry-routes.contract';

export const PUBLIC_ENTRY_ROUTES = new InjectionToken<readonly PublicEntryRouteDescriptor[]>(
  'PUBLIC_ENTRY_ROUTES'
);

export interface ResolvedPublicEntryRoute {
  readonly descriptor: PublicEntryRouteDescriptor;
  readonly context: PublicEntryRouteActivationContext;
}

const LOOKUP_KEY_SAFE_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function parseUrlParts(rawUrl: string): {
  pathname: string;
  safePathname: string;
  queryParams: Readonly<Record<string, string>>;
  fragment: string | null;
  guestLookupKey: string | null;
} {
  let parsed: URL;
  try {
    const normalizedInput = rawUrl && rawUrl.startsWith('/') ? rawUrl : `/${rawUrl ?? ''}`;
    parsed = new URL(normalizedInput, 'https://eventlens.internal');
  } catch {
    parsed = new URL('/', 'https://eventlens.internal');
  }

  const rawPathname = parsed.pathname || '/';
  const pathname =
    rawPathname.length > 1 && rawPathname.endsWith('/')
      ? rawPathname.replace(/\/+$/, '')
      : rawPathname;

  const queryParams: Record<string, string> = {};
  parsed.searchParams.forEach((value, key) => {
    queryParams[key] = value;
  });

  const fragment = parsed.hash ? parsed.hash.replace(/^#/, '') || null : null;

  let guestLookupKey: string | null = null;
  let safePathname = pathname;
  if (pathname.startsWith(APPROVED_PUBLIC_ENTRY_PATHS.GUEST_PREFIX)) {
    const remainder = pathname.slice(APPROVED_PUBLIC_ENTRY_PATHS.GUEST_PREFIX.length);
    if (remainder.length > 0 && !remainder.includes('/')) {
      try {
        const decodedKey = decodeURIComponent(remainder);
        if (LOOKUP_KEY_SAFE_PATTERN.test(decodedKey)) {
          guestLookupKey = decodedKey;
          safePathname = '/g/[redacted]';
        }
      } catch {
        guestLookupKey = null;
      }
    }
  }

  return {
    pathname,
    safePathname,
    queryParams: Object.freeze(queryParams),
    fragment,
    guestLookupKey
  };
}

export function matchPublicEntryRoute(
  rawUrl: string,
  descriptors: readonly PublicEntryRouteDescriptor[]
): ResolvedPublicEntryRoute | null {
  const { pathname, safePathname, queryParams, fragment, guestLookupKey } = parseUrlParts(rawUrl);

  for (const descriptor of descriptors) {
    if (descriptor.path === APPROVED_PUBLIC_ENTRY_PATHS.WILDCARD) {
      continue;
    }

    if (descriptor.path === APPROVED_PUBLIC_ENTRY_PATHS.GUEST_PATTERN) {
      if (guestLookupKey !== null) {
        return {
          descriptor,
          context: {
            pathname,
            safePathname,
            params: Object.freeze({ lookupKey: guestLookupKey }),
            queryParams,
            fragment
          }
        };
      }
      continue;
    }

    const normalizedDescriptorPath =
      descriptor.path === ''
        ? '/'
        : descriptor.path.startsWith('/')
          ? descriptor.path
          : `/${descriptor.path}`;

    if (normalizedDescriptorPath === pathname) {
      return {
        descriptor,
        context: {
          pathname,
          safePathname,
          params: Object.freeze({}),
          queryParams,
          fragment
        }
      };
    }

    if (normalizedDescriptorPath.includes(':')) {
      const descSegments = normalizedDescriptorPath.split('/').filter(Boolean);
      const pathSegments = pathname.split('/').filter(Boolean);

      if (descSegments.length === pathSegments.length) {
        let matches = true;
        const extractedParams: Record<string, string> = {};

        for (let i = 0; i < descSegments.length; i++) {
          const dSeg = descSegments[i];
          const pSeg = pathSegments[i];

          if (dSeg.startsWith(':')) {
            const paramName = dSeg.slice(1);
            if (/^[A-Za-z0-9_-]{1,128}$/.test(pSeg)) {
              extractedParams[paramName] = pSeg;
            } else {
              matches = false;
              break;
            }
          } else if (dSeg !== pSeg) {
            matches = false;
            break;
          }
        }

        if (matches) {
          const safePath = pathname.replace(extractedParams['eventId'] ?? '', '[redacted]');
          return {
            descriptor,
            context: {
              pathname,
              safePathname: safePath,
              params: Object.freeze(extractedParams),
              queryParams,
              fragment
            }
          };
        }
      }
    }
  }

  const wildcard = descriptors.find((d) => d.path === APPROVED_PUBLIC_ENTRY_PATHS.WILDCARD);
  if (!wildcard) {
    return null;
  }

  return {
    descriptor: wildcard,
    context: {
      pathname,
      safePathname: '/404',
      params: Object.freeze({}),
      queryParams,
      fragment
    }
  };
}

@Injectable({ providedIn: 'root' })
export class PublicEntryRouterService implements OnDestroy {
  private readonly routes = inject(PUBLIC_ENTRY_ROUTES, { optional: true }) ?? [];
  private readonly location = inject(Location, { optional: true });
  private readonly titleService = inject(Title, { optional: true });
  private readonly document = inject(DOCUMENT, { optional: true });
  private readonly angularRouter = inject(Router, { optional: true });

  private readonly activeRouteSignal = signal<ResolvedPublicEntryRoute | null>(null);
  private readonly navigationErrorSignal = signal<string | null>(null);
  private locationSubscription: { unsubscribe(): void } | null = null;
  private angularRouterSubscription: { unsubscribe(): void } | null = null;
  private navigationSequence = 0;

  readonly activeRoute = this.activeRouteSignal.asReadonly();
  readonly activeComponent = computed(() => this.activeRouteSignal()?.descriptor.component ?? null);
  readonly activeDescriptor = computed(() => this.activeRouteSignal()?.descriptor ?? null);
  readonly activeContext = computed(() => this.activeRouteSignal()?.context ?? null);
  readonly params = computed(() => this.activeRouteSignal()?.context.params ?? {});
  readonly queryParams = computed(() => this.activeRouteSignal()?.context.queryParams ?? {});
  readonly fragment = computed(() => this.activeRouteSignal()?.context.fragment ?? null);
  readonly currentSafePath = computed(
    () => this.activeRouteSignal()?.context.safePathname ?? APPROVED_PUBLIC_ENTRY_PATHS.HOME
  );
  readonly navigationError = this.navigationErrorSignal.asReadonly();

  private get isAngularRouterActive(): boolean {
    return (
      !!this.angularRouter &&
      Array.isArray(this.angularRouter.config) &&
      this.angularRouter.config.length > 0
    );
  }

  constructor() {
    if (this.isAngularRouterActive) {
      this.angularRouterSubscription = this.angularRouter!.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe((event) => {
          this.syncFromAngularUrl(event.urlAfterRedirects || event.url);
        });

      const initialUrl = this.angularRouter!.url || APPROVED_PUBLIC_ENTRY_PATHS.HOME;
      this.syncFromAngularUrl(initialUrl);
    } else {
      if (this.location) {
        this.locationSubscription = this.location.subscribe((event) => {
          const nextUrl = event.url || APPROVED_PUBLIC_ENTRY_PATHS.HOME;
          void this.navigateByUrl(nextUrl, { skipLocationUpdate: true });
        }) as { unsubscribe(): void };
      }

      if (this.routes.length > 0) {
        const initialUrl = this.location?.path(true) || APPROVED_PUBLIC_ENTRY_PATHS.HOME;
        void this.navigateByUrl(initialUrl, { skipLocationUpdate: true });
      }
    }
  }

  ngOnDestroy(): void {
    this.locationSubscription?.unsubscribe();
    this.angularRouterSubscription?.unsubscribe();
  }

  private syncFromAngularUrl(rawUrl: string): void {
    const matched = matchPublicEntryRoute(rawUrl, this.routes);
    if (matched) {
      this.activeRouteSignal.set(matched);
      if (this.titleService && matched.descriptor.title) {
        this.titleService.setTitle(matched.descriptor.title);
      }
      this.schedulePostNavigationFocus(matched.context.fragment);
    }
  }

  async navigateByUrl(
    rawUrl: string,
    options: { replaceUrl?: boolean; skipLocationUpdate?: boolean } = {}
  ): Promise<boolean> {
    const seq = ++this.navigationSequence;
    this.navigationErrorSignal.set(null);

    if (this.isAngularRouterActive) {
      try {
        const target = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
        const outcome = await this.angularRouter!.navigateByUrl(target, {
          replaceUrl: options.replaceUrl
        });
        if (outcome) {
          this.syncFromAngularUrl(this.angularRouter!.url);
        }
        return outcome;
      } catch {
        this.navigationErrorSignal.set(
          'No se pudo abrir esta vista temporalmente. Puedes volver a intentarlo.'
        );
        return false;
      }
    }

    try {
      const resolved = await this.resolveWithGuards(rawUrl, 0);
      if (seq !== this.navigationSequence || !resolved) {
        return false;
      }

      if (!options.skipLocationUpdate && this.location) {
        const targetUrl = this.formatLocationUrl(resolved.context, rawUrl);
        if (options.replaceUrl) {
          this.location.replaceState(targetUrl);
        } else {
          this.location.go(targetUrl);
        }
      }

      this.activeRouteSignal.set(resolved);
      if (this.titleService && resolved.descriptor.title) {
        this.titleService.setTitle(resolved.descriptor.title);
      }

      this.schedulePostNavigationFocus(resolved.context.fragment);
      return true;
    } catch {
      this.navigationErrorSignal.set(
        'No se pudo abrir esta vista temporalmente. Puedes volver a intentarlo.'
      );
      return false;
    }
  }

  async navigateToHomeAnchor(anchorId: string): Promise<boolean> {
    const validAnchor = (PUBLIC_HOME_ANCHORS as readonly string[]).includes(anchorId)
      ? anchorId
      : null;
    const targetUrl = validAnchor ? `/#${validAnchor}` : APPROVED_PUBLIC_ENTRY_PATHS.HOME;
    return this.navigateByUrl(targetUrl);
  }

  private async resolveWithGuards(
    rawUrl: string,
    depth: number
  ): Promise<ResolvedPublicEntryRoute | null> {
    if (depth > 5) {
      return matchPublicEntryRoute(APPROVED_PUBLIC_ENTRY_PATHS.HOME, this.routes);
    }

    const matched = matchPublicEntryRoute(rawUrl, this.routes);
    if (!matched) {
      return null;
    }

    const guards = matched.descriptor.canActivate ?? [];
    for (const guard of guards) {
      const outcome = await guard(matched.context);
      if (outcome === true) {
        continue;
      }
      if (typeof outcome === 'string' && outcome.trim().startsWith('/')) {
        return this.resolveWithGuards(outcome.trim(), depth + 1);
      }
      return this.resolveWithGuards(APPROVED_PUBLIC_ENTRY_PATHS.HOME, depth + 1);
    }

    return matched;
  }

  private formatLocationUrl(context: PublicEntryRouteActivationContext, rawUrl: string): string {
    if (context.pathname === parseUrlParts(rawUrl).pathname) {
      return rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
    }
    const search = new URLSearchParams(context.queryParams).toString();
    const hash = context.fragment ? `#${context.fragment}` : '';
    return `${context.pathname}${search ? `?${search}` : ''}${hash}`;
  }

  private schedulePostNavigationFocus(fragment: string | null): void {
    const doc = this.document;
    if (!doc) {
      return;
    }
    queueMicrotask(() => {
      if (fragment) {
        const anchorTarget = doc.getElementById(fragment);
        if (anchorTarget) {
          const heading =
            anchorTarget.matches('h1, h2, h3')
              ? anchorTarget
              : anchorTarget.querySelector<HTMLElement>('h2, h1, h3') ?? anchorTarget;
          if (!heading.hasAttribute('tabindex')) {
            heading.setAttribute('tabindex', '-1');
          }
          heading.focus();
          return;
        }
      }

      const mainHeading = doc.querySelector<HTMLElement>('main h1, h1');
      if (mainHeading) {
        if (!mainHeading.hasAttribute('tabindex')) {
          mainHeading.setAttribute('tabindex', '-1');
        }
        mainHeading.focus();
      }
    });
  }
}

@Component({
  selector: 'eventlens-router-outlet',
  standalone: true,
  imports: [NgComponentOutlet, RouterOutlet],
  template: `
    @if (hasAngularRouter) {
      <router-outlet></router-outlet>
    } @else {
      @if (router.navigationError(); as errorMsg) {
        <section role="alert" class="el-router-error">
          <p>{{ errorMsg }}</p>
          <button type="button" (click)="retryNavigation()">Reintentar</button>
        </section>
      } @else if (router.activeComponent(); as component) {
        <ng-container *ngComponentOutlet="component" />
      }
    }
  `
})
export class PublicEntryRouterOutletComponent {
  readonly router = inject(PublicEntryRouterService);
  private readonly angularRouter = inject(Router, { optional: true });

  get hasAngularRouter(): boolean {
    return (
      !!this.angularRouter &&
      Array.isArray(this.angularRouter.config) &&
      this.angularRouter.config.length > 0
    );
  }

  retryNavigation(): void {
    const currentPath = this.router.activeContext()?.pathname ?? APPROVED_PUBLIC_ENTRY_PATHS.HOME;
    void this.router.navigateByUrl(currentPath);
  }
}

export function providePublicEntryRouter(
  routes: readonly PublicEntryRouteDescriptor[]
): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: PUBLIC_ENTRY_ROUTES, useValue: routes },
    PublicEntryRouterService
  ]);
}
