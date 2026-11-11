import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button.js';
import { SiteTopbar } from './site-topbar.js';

const meta = {
  title: 'Coquille/En-tête du site',
  component: SiteTopbar,
  args: {
    brand: (
      <a href="#" className="font-display text-lg font-bold">
        OZ Football ID
      </a>
    ),
    navLabel: 'Navigation du site',
    links: [
      { id: 'pricing', href: '#tarifs', label: 'Tarifs' },
      { id: 'about', href: '#a-propos', label: 'À propos' },
      { id: 'contact', href: '#contact', label: 'Contact' },
    ],
    activeId: 'pricing',
    actions: (
      <>
        <Button variant="outline" size="sm" asChild>
          <a href="#connexion">Se connecter</a>
        </Button>
        <Button size="sm" glow asChild>
          <a href="#inscription">Créer un compte</a>
        </Button>
      </>
    ),
    menuLabel: 'Menu',
    closeLabel: 'Fermer le menu',
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'En-tête public (lot 1.5ca) d’après la maquette Manus : vitré et collant ; sous 640 px, une feuille plein écran (focus piégé, Échap) qui se ferme au choix d’un lien.',
      },
    },
  },
} satisfies Meta<typeof SiteTopbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Defaut: Story = { name: 'Par défaut' };
