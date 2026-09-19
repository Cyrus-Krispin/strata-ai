import { createTheme } from '@mui/material/styles';

export const strataAiTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#174C43',
      dark: '#103A34',
      contrastText: '#FFFDF7',
    },
    secondary: {
      main: '#C86F3D',
    },
    error: {
      main: '#A54335',
    },
    background: {
      default: '#F2F0E8',
      paper: '#FFFDF7',
    },
    text: {
      primary: '#1D2925',
      secondary: '#61706A',
    },
    divider: '#D8D8CE',
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily:
      'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    button: {
      fontSize: '0.82rem',
      fontWeight: 600,
      letterSpacing: 0,
      textTransform: 'none',
    },
    h1: {
      fontFamily:
        '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
      fontWeight: 600,
      letterSpacing: '-0.035em',
    },
    h2: {
      fontFamily:
        '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
      fontWeight: 600,
      letterSpacing: '-0.025em',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          minHeight: '100%',
        },
        body: {
          minWidth: 320,
          minHeight: '100vh',
          margin: 0,
          backgroundColor: '#F2F0E8',
        },
        '#root': {
          minHeight: '100vh',
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          minHeight: 42,
          borderRadius: 9,
          paddingInline: 18,
        },
        contained: {
          boxShadow: 'none',
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: '#FFFDF7',
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#8B9993',
          },
        },
        notchedOutline: {
          borderColor: '#C8CCC5',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
});
