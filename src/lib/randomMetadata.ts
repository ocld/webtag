import type { FileCategory, StandardTextField, TrackMetadata } from "./types";

type StreetFmt = "p" | "s" | "j";
type CityTuple = readonly [
  id: string,
  city: string,
  cc: string,
  state: string,
  country: string,
  lat: number,
  lon: number,
  fmt: StreetFmt,
  streets: readonly string[],
];

export interface AddressPreset {
  id: string;
  label: string;
  city: string;
  state: string;
  country: string;
  lat: number;
  lon: number;
  fmt: StreetFmt;
  streets: readonly string[];
}

export interface CustomLocation {
  address: string;
  city: string;
  state: string;
  country: string;
  gps: string;
}

const CITY_DATA: readonly CityTuple[] = [
  // north america
  ["new-york", "New York", "us", "New York", "United States", 40.7233, -73.9985, "p", ["Bedford Ave, Brooklyn", "Crosby St, SoHo", "Bleecker St, West Village", "Orchard St", "Mercer St"]],
  ["los-angeles", "Los Angeles", "us", "California", "United States", 34.0622, -118.2825, "p", ["Sunset Blvd, Silver Lake", "Abbot Kinney Blvd, Venice", "Melrose Ave", "N Figueroa St", "E 3rd St"]],
  ["chicago", "Chicago", "us", "Illinois", "United States", 41.8881, -87.6498, "p", ["N Milwaukee Ave", "W Fulton Market", "N Clark St", "N Damen Ave", "S Michigan Ave"]],
  ["san-francisco", "San Francisco", "us", "California", "United States", 37.7689, -122.4264, "p", ["Valencia St, Mission", "Hayes St", "Grant Ave, North Beach", "Divisadero St", "Clement St"]],
  ["austin", "Austin", "us", "Texas", "United States", 30.2672, -97.7431, "p", ["South Congress Ave", "East 6th St", "West 2nd St", "East Cesar Chavez St", "Lamar Blvd"]],
  ["seattle", "Seattle", "us", "Washington", "United States", 47.6145, -122.3208, "p", ["E Pike St, Capitol Hill", "Ballard Ave NW", "1st Ave, Belltown", "Fremont Ave N", "Pine St"]],
  ["miami", "Miami", "us", "Florida", "United States", 25.7907, -80.1936, "p", ["NW 2nd Ave, Wynwood", "Collins Ave, Miami Beach", "Calle Ocho", "Brickell Ave", "Lincoln Rd"]],
  ["boston", "Boston", "us", "Massachusetts", "United States", 42.3554, -71.064, "p", ["Newbury St", "Charles St, Beacon Hill", "Hanover St, North End", "Boylston St", "Tremont St"]],
  ["denver", "Denver", "us", "Colorado", "United States", 39.7508, -104.9966, "p", ["Larimer St, RiNo", "South Broadway", "16th St", "Tennyson St", "Wazee St"]],
  ["portland", "Portland", "us", "Oregon", "United States", 45.5231, -122.6765, "p", ["NW 23rd Ave", "SE Hawthorne Blvd", "N Mississippi Ave", "NE Alberta St", "SE Division St"]],
  ["washington-dc", "Washington", "us", "District of Columbia", "United States", 38.9072, -77.0369, "p", ["14th St NW", "M St NW, Georgetown", "U St NW", "Connecticut Ave NW", "H St NE"]],
  ["atlanta", "Atlanta", "us", "Georgia", "United States", 33.7676, -84.3676, "p", ["Peachtree St NE", "Ponce de Leon Ave", "Edgewood Ave SE", "Moreland Ave", "North Highland Ave"]],
  ["philadelphia", "Philadelphia", "us", "Pennsylvania", "United States", 39.9526, -75.1652, "p", ["Walnut St", "South St", "Frankford Ave, Fishtown", "Chestnut St", "Passyunk Ave"]],
  ["nashville", "Nashville", "us", "Tennessee", "United States", 36.1627, -86.7816, "p", ["Broadway", "12th Ave S", "Gallatin Ave, East Nashville", "Demonbreun St", "Hillsboro Pike"]],
  ["new-orleans", "New Orleans", "us", "Louisiana", "United States", 29.9584, -90.0644, "p", ["Royal St, French Quarter", "Magazine St", "Frenchmen St", "Chartres St", "St Charles Ave"]],
  ["las-vegas", "Las Vegas", "us", "Nevada", "United States", 36.1699, -115.1398, "p", ["Fremont St", "S Main St, Arts District", "Las Vegas Blvd", "Charleston Blvd", "Spring Mountain Rd"]],
  ["phoenix", "Phoenix", "us", "Arizona", "United States", 33.4484, -112.074, "p", ["E Roosevelt St", "N Central Ave", "Grand Ave", "E Camelback Rd", "N 7th St"]],
  ["dallas", "Dallas", "us", "Texas", "United States", 32.7831, -96.7836, "p", ["Main St, Deep Ellum", "Bishop Ave", "McKinney Ave", "Elm St", "Henderson Ave"]],
  ["houston", "Houston", "us", "Texas", "United States", 29.7508, -95.3821, "p", ["Westheimer Rd, Montrose", "White Oak Dr", "Main St", "Washington Ave", "W 19th St"]],
  ["minneapolis", "Minneapolis", "us", "Minnesota", "United States", 44.9778, -93.265, "p", ["N Washington Ave, North Loop", "Hennepin Ave", "Lyndale Ave S", "Nicollet Ave", "E Hennepin Ave"]],
  ["detroit", "Detroit", "us", "Michigan", "United States", 42.3314, -83.0458, "p", ["Woodward Ave", "Michigan Ave, Corktown", "Cass Ave, Midtown", "Gratiot Ave", "W Canfield St"]],
  ["san-diego", "San Diego", "us", "California", "United States", 32.7157, -117.1611, "p", ["30th St, North Park", "India St, Little Italy", "Fifth Ave, Gaslamp", "Prospect St, La Jolla", "Adams Ave"]],
  ["honolulu", "Honolulu", "us", "Hawaii", "United States", 21.3069, -157.8583, "p", ["Kalakaua Ave", "Monsarrat Ave", "Kapahulu Ave", "S King St", "N Hotel St"]],
  ["anchorage", "Anchorage", "us", "Alaska", "United States", 61.2181, -149.9003, "p", ["W 4th Ave", "Spenard Rd", "G St", "W Northern Lights Blvd", "K St"]],
  ["toronto", "Toronto", "ca", "Ontario", "Canada", 43.6532, -79.3832, "p", ["Queen St W", "Ossington Ave", "Dundas St W", "Spadina Ave", "College St"]],
  ["vancouver", "Vancouver", "ca", "British Columbia", "Canada", 49.2827, -123.1207, "p", ["Water St, Gastown", "Robson St", "Main St, Mount Pleasant", "Commercial Dr", "Denman St"]],
  ["montreal", "Montreal", "ca", "Quebec", "Canada", 45.5152, -73.5778, "p", ["Boulevard Saint-Laurent", "Rue Saint-Paul Ouest", "Avenue du Mont-Royal E", "Rue Saint-Viateur", "Rue Notre-Dame Ouest"]],
  ["ottawa", "Ottawa", "ca", "Ontario", "Canada", 45.4215, -75.6972, "p", ["Bank St", "Elgin St", "Sussex Dr", "Wellington St W", "Sparks St"]],
  ["calgary", "Calgary", "ca", "Alberta", "Canada", 51.0447, -114.0719, "p", ["17 Ave SW", "9 Ave SE, Inglewood", "Stephen Ave", "Kensington Rd NW", "4 St SW"]],
  ["mexico-city", "Mexico City", "mx", "CDMX", "Mexico", 19.4194, -99.162, "s", ["Calle Colima, Roma Norte", "Av. Álvaro Obregón", "Calle Tamaulipas, Condesa", "Calle Amsterdam", "Calle Havre, Juárez"]],
  ["guadalajara", "Guadalajara", "mx", "Jalisco", "Mexico", 20.6736, -103.368, "s", ["Av. Chapultepec", "Calle Pedro Moreno", "Calle Libertad, Americana", "Calle López Cotilla", "Av. Vallarta"]],
  ["monterrey", "Monterrey", "mx", "Nuevo León", "Mexico", 25.6714, -100.309, "s", ["Calle Morelos, Barrio Antiguo", "Calzada del Valle", "Av. Hidalgo", "Calle Padre Mier", "Av. Ocampo"]],
  ["cancun", "Cancún", "mx", "Quintana Roo", "Mexico", 21.1619, -86.8515, "s", ["Av. Nader", "Av. Tulum", "Blvd. Kukulcan", "Av. Bonampak", "Av. Yaxchilán"]],
  ["san-juan", "San Juan", "pr", "Puerto Rico", "Puerto Rico", 18.4655, -66.1057, "s", ["Calle San Sebastián", "Calle Fortaleza", "Av. Ashford, Condado", "Calle Loíza", "Calle Cristo"]],
  ["havana", "Havana", "cu", "La Habana", "Cuba", 23.1367, -82.3589, "s", ["Calle Obispo", "Paseo del Prado", "Calle 23, Vedado", "Calle O'Reilly", "Malecón"]],

  // south america
  ["buenos-aires", "Buenos Aires", "ar", "CABA", "Argentina", -34.5885, -58.4267, "s", ["El Salvador, Palermo", "Defensa, San Telmo", "Av. Alvear, Recoleta", "Gorriti, Palermo", "Av. Corrientes"]],
  ["sao-paulo", "São Paulo", "br", "São Paulo", "Brazil", -23.5614, -46.6559, "s", ["Av. Paulista", "Rua Augusta", "Rua Oscar Freire", "Rua Aspicuelta, Vila Madalena", "Rua dos Pinheiros"]],
  ["rio-de-janeiro", "Rio de Janeiro", "br", "Rio de Janeiro", "Brazil", -22.9711, -43.1825, "s", ["Rua Visconde de Pirajá, Ipanema", "Av. Atlântica, Copacabana", "Rua Dias Ferreira, Leblon", "Rua do Lavradio", "Rua Voluntários da Pátria"]],
  ["santiago", "Santiago", "cl", "Metropolitana", "Chile", -33.4372, -70.6344, "s", ["Av. Italia, Providencia", "José Victorino Lastarria", "Av. Providencia", "Calle Bellavista", "Alonso de Córdova"]],
  ["bogota", "Bogotá", "co", "Cundinamarca", "Colombia", 4.6533, -74.0636, "s", ["Carrera 7, Chapinero", "Calle 82, Zona Rosa", "Carrera 4, La Candelaria", "Calle 70, Zona G", "Carrera 13"]],
  ["medellin", "Medellín", "co", "Antioquia", "Colombia", 6.2088, -75.567, "s", ["Calle 10, El Poblado", "Carrera 37, Provenza", "Av. Nutibara, Laureles", "Carrera 70", "Calle 10A"]],
  ["lima", "Lima", "pe", "Lima", "Peru", -12.1219, -77.0297, "s", ["Av. Larco, Miraflores", "Av. Grau, Barranco", "Calle Berlín", "Av. Pedro de Osma", "Av. Conquistadores"]],
  ["cusco", "Cusco", "pe", "Cusco", "Peru", -13.5167, -71.9788, "s", ["Calle Plateros", "Cuesta de San Blas", "Av. El Sol", "Calle Palacio", "Calle Triunfo"]],
  ["montevideo", "Montevideo", "uy", "Montevideo", "Uruguay", -34.9059, -56.1852, "s", ["Av. 18 de Julio", "Peatonal Sarandí", "Rambla República del Perú", "Calle 21 de Setiembre", "Bulevar España"]],
  ["quito", "Quito", "ec", "Pichincha", "Ecuador", -0.2098, -78.491, "s", ["Calle García Moreno", "Av. Amazonas", "Calle La Ronda", "Av. González Suárez", "Calle Isabel La Católica"]],

  // europe
  ["london", "London", "uk", "Greater London", "United Kingdom", 51.5152, -0.1281, "p", ["Redchurch St, Shoreditch", "Portobello Rd, Notting Hill", "Berwick St, Soho", "Columbia Rd", "Neal St, Covent Garden"]],
  ["edinburgh", "Edinburgh", "uk", "Scotland", "United Kingdom", 55.9533, -3.1883, "p", ["Victoria St", "George St", "Cockburn St", "Rose St", "Princes St"]],
  ["manchester", "Manchester", "uk", "Greater Manchester", "United Kingdom", 53.4808, -2.2426, "p", ["Oldham St, Northern Quarter", "Deansgate", "King St", "Tib St", "Oxford Rd"]],
  ["dublin", "Dublin", "ie", "Leinster", "Ireland", 53.3441, -6.2675, "p", ["Grafton St", "Drury St", "South William St", "Camden St", "Capel St"]],
  ["paris", "Paris", "fr", "Île-de-France", "France", 48.8588, 2.347, "p", ["Rue de Turenne, Le Marais", "Rue des Martyrs", "Rue Oberkampf", "Rue de Bretagne", "Boulevard Saint-Germain"]],
  ["lyon", "Lyon", "fr", "Auvergne-Rhône-Alpes", "France", 45.764, 4.8357, "p", ["Rue de la République", "Rue Saint-Jean", "Grande Rue de la Croix-Rousse", "Rue Mercière", "Quai Saint-Antoine"]],
  ["marseille", "Marseille", "fr", "Provence-Alpes-Côte d'Azur", "France", 43.2965, 5.3698, "p", ["Cours Julien", "Rue Saint-Ferréol", "La Canebière", "Rue de la République", "Quai du Port"]],
  ["berlin", "Berlin", "de", "Berlin", "Germany", 52.52, 13.405, "s", ["Torstraße, Mitte", "Oranienstraße, Kreuzberg", "Kastanienallee", "Weserstraße, Neukölln", "Linienstraße"]],
  ["munich", "Munich", "de", "Bavaria", "Germany", 48.1351, 11.582, "s", ["Leopoldstraße, Schwabing", "Sendlinger Straße", "Maximilianstraße", "Gärtnerplatz", "Fraunhoferstraße"]],
  ["hamburg", "Hamburg", "de", "Hamburg", "Germany", 53.5511, 9.9937, "s", ["Schulterblatt, Schanzenviertel", "Jungfernstieg", "Mönckebergstraße", "Eppendorfer Landstraße", "Ottenser Hauptstraße"]],
  ["amsterdam", "Amsterdam", "nl", "North Holland", "Netherlands", 52.3676, 4.9041, "s", ["Herengracht", "Prinsengracht", "Keizersgracht", "Haarlemmerdijk", "Utrechtsestraat"]],
  ["rotterdam", "Rotterdam", "nl", "South Holland", "Netherlands", 51.9244, 4.4777, "s", ["Witte de Withstraat", "Meent", "Nieuwe Binnenweg", "Coolsingel", "Pannekoekstraat"]],
  ["brussels", "Brussels", "be", "Brussels", "Belgium", 50.8503, 4.3517, "s", ["Rue Antoine Dansaert", "Avenue Louise", "Rue Haute, Marolles", "Chaussée d'Ixelles", "Rue des Bouchers"]],
  ["zurich", "Zurich", "ch", "Zurich", "Switzerland", 47.3769, 8.5417, "s", ["Bahnhofstrasse", "Limmatquai", "Niederdorfstrasse", "Langstrasse", "Seefeldstrasse"]],
  ["geneva", "Geneva", "ch", "Geneva", "Switzerland", 46.2044, 6.1432, "s", ["Rue du Rhône", "Rue de Carouge", "Grand-Rue", "Rue du Mont-Blanc", "Rue des Bains"]],
  ["vienna", "Vienna", "at", "Vienna", "Austria", 48.2082, 16.3738, "s", ["Neubaugasse", "Mariahilfer Straße", "Kärntner Straße", "Spittelberggasse", "Praterstraße"]],
  ["prague", "Prague", "cz", "Prague", "Czechia", 50.0875, 14.4213, "s", ["Pařížská, Staré Město", "Národní", "Nerudova, Malá Strana", "Krymská, Vršovice", "Dlouhá"]],
  ["warsaw", "Warsaw", "pl", "Masovia", "Poland", 52.2297, 21.0122, "s", ["Nowy Świat", "Mokotowska", "Krakowskie Przedmieście", "Chmielna", "Francuska"]],
  ["krakow", "Kraków", "pl", "Lesser Poland", "Poland", 50.0647, 19.945, "s", ["Floriańska", "Grodzka", "Józefa, Kazimierz", "Szewska", "Karmelicka"]],
  ["budapest", "Budapest", "hu", "Budapest", "Hungary", 47.4979, 19.0402, "s", ["Andrássy út", "Kazinczy utca", "Váci utca", "Bartók Béla út", "Király utca"]],
  ["rome", "Rome", "it", "Lazio", "Italy", 41.8967, 12.4822, "s", ["Via del Corso", "Via dei Coronari", "Via Urbana, Monti", "Via della Lungaretta, Trastevere", "Via Condotti"]],
  ["milan", "Milan", "it", "Lombardy", "Italy", 45.4642, 9.19, "s", ["Via Brera", "Corso Como", "Via Tortona", "Corso Buenos Aires", "Via Torino"]],
  ["florence", "Florence", "it", "Tuscany", "Italy", 43.7696, 11.2558, "s", ["Via dei Calzaiuoli", "Via Tornabuoni", "Borgo San Frediano", "Via Maggio", "Via Santo Spirito"]],
  ["venice", "Venice", "it", "Veneto", "Italy", 45.4408, 12.3155, "s", ["Strada Nova", "Mercerie", "Fondamenta della Misericordia", "Calle Larga XXII Marzo", "Salizada San Lio"]],
  ["naples", "Naples", "it", "Campania", "Italy", 40.8518, 14.2681, "s", ["Via Toledo", "Via dei Tribunali", "Via Chiaia", "Spaccanapoli", "Via San Gregorio Armeno"]],
  ["madrid", "Madrid", "es", "Madrid", "Spain", 40.4203, -3.7058, "s", ["Calle de Fuencarral", "Calle de Velázquez", "Gran Vía", "Calle de Alcalá", "Calle de la Palma, Malasaña"]],
  ["barcelona", "Barcelona", "es", "Catalonia", "Spain", 41.3902, 2.164, "s", ["Carrer de Verdi, Gràcia", "Passeig del Born", "Carrer d'Enric Granados", "Rambla del Poblenou", "Carrer dels Tallers"]],
  ["seville", "Seville", "es", "Andalusia", "Spain", 37.3891, -5.9845, "s", ["Calle Sierpes", "Calle Betis, Triana", "Calle Feria", "Avenida de la Constitución", "Calle Regina"]],
  ["valencia", "Valencia", "es", "Valencia", "Spain", 39.4699, -0.3763, "s", ["Carrer de Colón", "Carrer dels Cavallers", "Carrer de Sueca, Ruzafa", "Carrer de la Pau", "Carrer de Cádiz"]],
  ["lisbon", "Lisbon", "pt", "Lisbon", "Portugal", 38.7139, -9.1394, "s", ["Rua Garrett, Chiado", "Avenida da Liberdade", "Rua da Escola Politécnica", "Rua Dom Pedro V", "Rua dos Fanqueiros"]],
  ["porto", "Porto", "pt", "Porto", "Portugal", 41.1579, -8.6291, "s", ["Rua de Santa Catarina", "Rua das Flores", "Rua de Cedofeita", "Rua Miguel Bombarda", "Avenida dos Aliados"]],
  ["stockholm", "Stockholm", "se", "Stockholm", "Sweden", 59.3193, 18.0719, "s", ["Götgatan, Södermalm", "Skånegatan", "Biblioteksgatan", "Rörstrandsgatan", "Hornsgatan"]],
  ["oslo", "Oslo", "no", "Oslo", "Norway", 59.9139, 10.7522, "s", ["Karl Johans gate", "Thorvald Meyers gate", "Bogstadveien", "Torggata", "Aker Brygge"]],
  ["copenhagen", "Copenhagen", "dk", "Capital Region", "Denmark", 55.6761, 12.5683, "s", ["Bredgade", "Jægersborggade, Nørrebro", "Værnedamsvej", "Strøget", "Istedgade, Vesterbro"]],
  ["helsinki", "Helsinki", "fi", "Uusimaa", "Finland", 60.1699, 24.9384, "s", ["Aleksanterinkatu", "Fredrikinkatu", "Iso Roobertinkatu", "Esplanadi", "Hämeentie"]],
  ["reykjavik", "Reykjavik", "is", "Capital Region", "Iceland", 64.1466, -21.9426, "s", ["Laugavegur", "Skólavörðustígur", "Austurstræti", "Hverfisgata", "Bankastræti"]],
  ["athens", "Athens", "gr", "Attica", "Greece", 37.9795, 23.7264, "s", ["Ermou", "Adrianou, Plaka", "Skoufa, Kolonaki", "Athinas", "Aiolou"]],
  ["istanbul", "Istanbul", "tr", "Istanbul", "Turkey", 41.0282, 28.9784, "s", ["İstiklal Caddesi, Beyoğlu", "Bağdat Caddesi, Kadıköy", "Serdar-ı Ekrem, Galata", "Abdi İpekçi, Nişantaşı", "Moda Caddesi"]],
  ["bucharest", "Bucharest", "ro", "Bucharest", "Romania", 44.4268, 26.1025, "s", ["Calea Victoriei", "Strada Lipscani", "Bulevardul Magheru", "Strada Arthur Verona", "Calea Dorobanților"]],
  ["belgrade", "Belgrade", "rs", "Belgrade", "Serbia", 44.8125, 20.4612, "s", ["Knez Mihailova", "Strahinjića Bana", "Skadarska", "Bulevar Kralja Aleksandra", "Svetogorska"]],
  ["zagreb", "Zagreb", "hr", "Zagreb", "Croatia", 45.815, 15.9819, "s", ["Ilica", "Tkalčićeva", "Martićeva", "Bogovićeva", "Teslina"]],
  ["ljubljana", "Ljubljana", "si", "Ljubljana", "Slovenia", 46.0569, 14.5058, "s", ["Čopova ulica", "Trubarjeva cesta", "Stari trg", "Slovenska cesta", "Cankarjevo nabrežje"]],
  ["tallinn", "Tallinn", "ee", "Harju", "Estonia", 59.437, 24.7536, "s", ["Viru tänav", "Telliskivi", "Pikk tänav", "Rataskaevu", "Kalamaja"]],
  ["riga", "Riga", "lv", "Riga", "Latvia", 56.9496, 24.1052, "s", ["Brīvības iela", "Alberta iela", "Miera iela", "Kaļķu iela", "Elizabetes iela"]],
  ["kyiv", "Kyiv", "ua", "Kyiv", "Ukraine", 50.4501, 30.5234, "s", ["Khreshchatyk St", "Andriivskyi Descent", "Yaroslaviv Val St", "Sahaidachnoho St", "Reitarska St"]],

  // asia
  ["tokyo", "Tokyo", "jp", "Tokyo", "Japan", 35.6684, 139.7062, "j", ["Jingumae, Shibuya-ku", "Minami-Aoyama, Minato-ku", "Daikanyamacho, Shibuya-ku", "Kitazawa, Setagaya-ku", "Nakameguro, Meguro-ku"]],
  ["kyoto", "Kyoto", "jp", "Kyoto", "Japan", 35.0116, 135.7681, "j", ["Kiyamachi-dori, Nakagyo-ku", "Shinmonzen-dori, Higashiyama-ku", "Teramachi-dori, Nakagyo-ku", "Sanjo-dori, Nakagyo-ku", "Marutamachi-dori"]],
  ["osaka", "Osaka", "jp", "Osaka", "Japan", 34.6723, 135.4981, "j", ["Shinsaibashisuji, Chuo-ku", "Minamihorie, Nishi-ku", "Nakazakicho, Kita-ku", "Dotonbori, Chuo-ku", "Umeda, Kita-ku"]],
  ["sapporo", "Sapporo", "jp", "Hokkaido", "Japan", 43.0618, 141.3545, "j", ["Odorinishi, Chuo-ku", "Minami 3 Jonishi, Chuo-ku", "Kita 2 Jonishi, Chuo-ku", "Maruyama, Chuo-ku", "Susukino, Chuo-ku"]],
  ["fukuoka", "Fukuoka", "jp", "Fukuoka", "Japan", 33.5902, 130.4017, "j", ["Daimyo, Chuo-ku", "Tenjin, Chuo-ku", "Imaizumi, Chuo-ku", "Hakataekimae, Hakata-ku", "Yakuin, Chuo-ku"]],
  ["seoul", "Seoul", "kr", "Seoul", "South Korea", 37.5446, 127.0559, "p", ["Seongsui-ro, Seongdong-gu", "Garosu-gil, Gangnam-gu", "Bukchon-ro, Jongno-gu", "Yeonhui-ro, Seodaemun-gu", "Itaewon-ro, Yongsan-gu"]],
  ["busan", "Busan", "kr", "Busan", "South Korea", 35.1595, 129.1603, "p", ["Haeundaehaebyeon-ro", "Gwanganhaebyeon-ro", "Jeonpo-daero, Busanjin-gu", "Gwangbok-ro, Jung-gu", "Dalmaji-gil"]],
  ["taipei", "Taipei", "tw", "Taipei", "Taiwan", 25.0424, 121.5355, "p", ["Yongkang St, Da'an", "Dihua St Sec. 1", "Fujin St, Songshan", "Chifeng St, Datong", "Zhongxiao E Rd Sec. 4"]],
  ["hong-kong", "Hong Kong", "hk", "Hong Kong Island", "Hong Kong", 22.2819, 114.1558, "p", ["Hollywood Rd, Central", "Gough St, Sheung Wan", "Star St, Wan Chai", "Nathan Rd, Kowloon", "Queen's Rd Central"]],
  ["shanghai", "Shanghai", "cn", "Shanghai", "China", 31.2165, 121.454, "p", ["Anfu Rd, Xuhui", "Wukang Rd, Xuhui", "Nanjing W Rd, Jing'an", "Huaihai Middle Rd", "Changle Rd"]],
  ["beijing", "Beijing", "cn", "Beijing", "China", 39.9289, 116.4167, "p", ["Sanlitun Rd, Chaoyang", "Nanluoguxiang, Dongcheng", "Wudaoying Hutong", "Wangfujing St", "Gulou E St"]],
  ["shenzhen", "Shenzhen", "cn", "Guangdong", "China", 22.5431, 114.0579, "p", ["Shennan Blvd, Futian", "Keyuan Rd, Nanshan", "Huaqiang N Rd", "Haide 3rd Rd", "Binhai Blvd"]],
  ["chengdu", "Chengdu", "cn", "Sichuan", "China", 30.6586, 104.0648, "p", ["Chunxi Rd, Jinjiang", "Kuanzhai Alley", "Yulin W Rd", "Taikoo Li", "Jinli St"]],
  ["singapore", "Singapore", "sg", "Central Region", "Singapore", 1.2903, 103.8519, "p", ["Haji Lane", "Neil Rd, Tanjong Pagar", "Club St, Chinatown", "Tiong Bahru Rd", "Joo Chiat Rd"]],
  ["bangkok", "Bangkok", "th", "Bangkok", "Thailand", 13.7367, 100.5608, "p", ["Sukhumvit Soi 55, Thonglor", "Charoen Krung Rd", "Ari Samphan", "Silom Rd", "Yaowarat Rd"]],
  ["chiang-mai", "Chiang Mai", "th", "Chiang Mai", "Thailand", 18.7961, 98.9675, "p", ["Nimmanhaemin Rd", "Tha Phae Rd", "Ratchadamnoen Rd", "Charoen Rat Rd", "Wua Lai Rd"]],
  ["hanoi", "Hanoi", "vn", "Hanoi", "Vietnam", 21.0285, 105.8542, "p", ["Hang Gai St, Hoan Kiem", "Xuan Dieu, Tay Ho", "Ly Quoc Su St", "Ta Hien St", "Phan Dinh Phung St"]],
  ["ho-chi-minh", "Ho Chi Minh City", "vn", "Ho Chi Minh", "Vietnam", 10.7769, 106.7009, "p", ["Dong Khoi St, District 1", "Xuan Thuy, Thao Dien", "Nguyen Hue Blvd", "Le Loi Blvd", "Bui Vien St"]],
  ["kuala-lumpur", "Kuala Lumpur", "my", "Kuala Lumpur", "Malaysia", 3.1478, 101.7117, "p", ["Jalan Bukit Bintang", "Jalan Telawi, Bangsar", "Jalan Petaling", "Jalan Alor", "Jalan Ampang"]],
  ["jakarta", "Jakarta", "id", "DKI Jakarta", "Indonesia", -6.2297, 106.8095, "s", ["Jalan Kemang Raya", "Jalan Senopati", "Jalan Sudirman", "Jalan Sabang", "Jalan Gunawarman"]],
  ["bali", "Denpasar (Bali)", "id", "Bali", "Indonesia", -8.65, 115.1385, "s", ["Jalan Pantai Batu Bolong, Canggu", "Jalan Kayu Aya, Seminyak", "Jalan Raya Ubud", "Jalan Monkey Forest", "Jalan Petitenget"]],
  ["manila", "Manila", "ph", "Metro Manila", "Philippines", 14.5547, 121.0244, "p", ["Bonifacio High St, BGC", "Poblacion, Makati", "Ayala Ave", "Escolta St", "Tomas Morato Ave"]],
  ["mumbai", "Mumbai", "in", "Maharashtra", "India", 19.0596, 72.8295, "p", ["Pali Hill, Bandra West", "Colaba Causeway", "Kala Ghoda", "Linking Rd", "Marine Drive"]],
  ["new-delhi", "New Delhi", "in", "Delhi", "India", 28.6139, 77.209, "p", ["Khan Market", "Connaught Place", "Hauz Khas Village", "Janpath", "Lodhi Colony"]],
  ["bengaluru", "Bengaluru", "in", "Karnataka", "India", 12.9716, 77.5946, "p", ["100 Feet Rd, Indiranagar", "Church St", "Lavelle Rd", "Brigade Rd", "80 Feet Rd, Koramangala"]],
  ["kathmandu", "Kathmandu", "np", "Bagmati", "Nepal", 27.7154, 85.3123, "p", ["Thamel Marg", "Jhamsikhel Rd", "Durbar Marg", "Lazimpat Rd", "Freak St"]],

  // middle east
  ["dubai", "Dubai", "ae", "Dubai", "United Arab Emirates", 25.2048, 55.2708, "p", ["Al Wasl Rd, Jumeirah", "Sheikh Zayed Rd", "Jumeirah Beach Rd", "Alserkal Ave", "Marina Walk"]],
  ["abu-dhabi", "Abu Dhabi", "ae", "Abu Dhabi", "United Arab Emirates", 24.4539, 54.3773, "p", ["Corniche Rd", "Hamdan Bin Mohammed St", "Al Maryah Island", "Yas Bay Waterfront", "Saadiyat Cultural District"]],
  ["doha", "Doha", "qa", "Doha", "Qatar", 25.2854, 51.531, "p", ["Souq Waqif", "Al Corniche St", "Msheireb Downtown", "The Pearl Blvd", "West Bay"]],
  ["riyadh", "Riyadh", "sa", "Riyadh", "Saudi Arabia", 24.7136, 46.6753, "p", ["Olaya St", "Tahlia St", "King Fahd Rd", "Prince Turki Al Awwal Rd", "Al Urubah Rd"]],
  ["amman", "Amman", "jo", "Amman", "Jordan", 31.9539, 35.9106, "p", ["Rainbow St, Jabal Amman", "Al-Wakalat St", "Paris Square, Weibdeh", "Mecca St", "King Talal St"]],

  // oceania
  ["sydney", "Sydney", "au", "New South Wales", "Australia", -33.8736, 151.2093, "p", ["Crown St, Surry Hills", "King St, Newtown", "Oxford St, Paddington", "George St, The Rocks", "Gould St, Bondi Beach"]],
  ["melbourne", "Melbourne", "au", "Victoria", "Australia", -37.8136, 144.9631, "p", ["Flinders Lane", "Gertrude St, Fitzroy", "Brunswick St, Fitzroy", "Smith St, Collingwood", "Chapel St"]],
  ["brisbane", "Brisbane", "au", "Queensland", "Australia", -27.4698, 153.0251, "p", ["James St, Fortitude Valley", "Boundary St, West End", "Queen St", "Given Terrace, Paddington", "Brunswick St"]],
  ["perth", "Perth", "au", "Western Australia", "Australia", -31.9505, 115.8605, "p", ["Beaufort St, Mount Lawley", "William St, Northbridge", "King St", "High St, Fremantle", "Rokeby Rd, Subiaco"]],
  ["auckland", "Auckland", "nz", "Auckland", "New Zealand", -36.8509, 174.7645, "p", ["Ponsonby Rd", "Karangahape Rd", "High St", "Britomart Pl", "Dominion Rd"]],
  ["wellington", "Wellington", "nz", "Wellington", "New Zealand", -41.2924, 174.7787, "p", ["Cuba St", "Lambton Quay", "Courtenay Pl", "Willis St", "Ghuznee St"]],
  ["queenstown", "Queenstown", "nz", "Otago", "New Zealand", -45.0312, 168.6626, "p", ["The Mall", "Rees St", "Shotover St", "Beach St", "Camp St"]],

  // africa
  ["cairo", "Cairo", "eg", "Cairo", "Egypt", 30.0444, 31.2357, "s", ["26th of July Corridor, Zamalek", "Talaat Harb St", "Al-Muizz St", "Road 9, Maadi", "Brazil St, Zamalek"]],
  ["cape-town", "Cape Town", "za", "Western Cape", "South Africa", -33.9249, 18.4241, "p", ["Kloof St, Gardens", "Long St", "Bree St", "Main Rd, Sea Point", "Lower Main Rd, Observatory"]],
  ["johannesburg", "Johannesburg", "za", "Gauteng", "South Africa", -26.1929, 28.0305, "p", ["Juta St, Braamfontein", "4th Ave, Parkhurst", "Fox St, Maboneng", "7th St, Melville", "Jan Smuts Ave"]],
  ["nairobi", "Nairobi", "ke", "Nairobi", "Kenya", -1.2921, 36.8219, "p", ["Kenyatta Ave", "Ngong Rd", "Westlands Rd", "Woodvale Grove", "Karen Rd"]],
  ["lagos", "Lagos", "ng", "Lagos", "Nigeria", 6.4541, 3.4246, "p", ["Adeola Odeku St, Victoria Island", "Admiralty Way, Lekki", "Bourdillon Rd, Ikoyi", "Allen Ave, Ikeja", "Akin Adesola St"]],
  ["casablanca", "Casablanca", "ma", "Casablanca-Settat", "Morocco", 33.5731, -7.5898, "s", ["Boulevard d'Anfa", "Boulevard Mohammed V", "Rue Jean Jaurès", "Boulevard de la Corniche", "Boulevard Zerktouni"]],
  ["marrakech", "Marrakech", "ma", "Marrakesh-Safi", "Morocco", 31.6295, -7.9811, "s", ["Avenue Mohammed V, Guéliz", "Rue de la Liberté", "Rue Majorelle", "Derb Dabachi", "Avenue Mohammed VI"]],
  ["accra", "Accra", "gh", "Greater Accra", "Ghana", 5.6037, -0.187, "p", ["Oxford St, Osu", "Cantonments Rd", "Liberation Rd", "Labone Crescent", "Spintex Rd"]],
  ["addis-ababa", "Addis Ababa", "et", "Addis Ababa", "Ethiopia", 9.0192, 38.7525, "p", ["Bole Rd", "Churchill Ave", "Africa Ave", "Cameroon St", "Ethio-China St"]],
  ["dakar", "Dakar", "sn", "Dakar", "Senegal", 14.7167, -17.4677, "s", ["Route des Almadies", "Avenue Léopold Sédar Senghor", "Corniche Ouest", "Rue Mohamed V", "Avenue Cheikh Anta Diop"]],
  ["tunis", "Tunis", "tn", "Tunis", "Tunisia", 36.8065, 10.1815, "s", ["Avenue Habib Bourguiba", "Rue du Pacha", "Avenue de Paris", "Rue Charles de Gaulle", "Avenue de la Liberté"]],
  ["kigali", "Kigali", "rw", "Kigali", "Rwanda", -1.9441, 30.0619, "p", ["KN 4 Ave", "KG 7 Ave", "KN 3 Rd", "KG 9 Ave", "KK 15 Rd"]],
];

export const ADDRESS_PRESETS: AddressPreset[] = CITY_DATA.map(
  ([id, city, cc, state, country, lat, lon, fmt, streets]) => ({
    id,
    label: `${city.toLowerCase()}, ${cc}`,
    city,
    state,
    country,
    lat,
    lon,
    fmt,
    streets,
  })
);

const FIRST_NAMES = [
  "Sora", "Maren", "Lukas", "Nadia", "Kieran", "Yuki", "Freja", "Mateo",
  "Clara", "Devon", "Tessa", "Henrik", "Amina", "Callum", "Linnea", "Julian",
  "Hana", "Theo", "Ines", "Ronan", "Mei", "Samir",
];

const LAST_NAMES = [
  "Lindholm", "Takahashi", "Vargas", "Kowalski", "Okafor", "Mercer", "Sato", "Bauer",
  "Delgado", "Nystrom", "Alvarez", "Haddad", "Novak", "Richter", "Mori", "Solberg",
  "Chen", "Silva", "Keller", "Moreau",
];

const STUDIOS = [
  "Northlight Archive", "Halcyon Fieldworks", "Bluehour Collective", "Meridian Press",
  "Clearwater Media", "Atelier Horizon", "Kestrel Visuals", "Monolith Audio Lab",
  "Daybreak Labs", "Sunburst Interactive", "Pinecone Works", "Paperkite Software",
];

const CAMERAS: Array<{ make: string; model: string }> = [
  { make: "Fujifilm", model: "X100VI" },
  { make: "Sony", model: "ILCE-7CR" },
  { make: "Leica", model: "Q3" },
  { make: "Ricoh", model: "GR IIIx" },
  { make: "Nikon", model: "Z f" },
  { make: "Canon", model: "EOS R6 Mark II" },
  { make: "Hasselblad", model: "X2D 100C" },
  { make: "Apple", model: "iPhone 16 Pro" },
];

const PHOTO_EDITORS = [
  "Capture One 24", "Adobe Lightroom Classic 14.0", "Darktable 4.8", "Affinity Photo 2.5",
  "Pixelmator Pro 3.6", "Photomator 3.4", "GIMP 3.0",
];

const AUDIO_ENCODERS = [
  "LAME 3.100", "libFLAC 1.4.3", "Apple CoreAudio AAC", "Lavf61.7.100", "Opus 1.5.2",
];

const DOC_EDITORS = [
  "LibreOffice 25.2", "Apple Pages 14.3", "Google Docs", "Typst 0.13", "Microsoft Word",
];

const APP_BUILD_TOOLS = [
  "Xcode 16.2", "Android Gradle 8.9", "LLVM Clang 19.1", "MSVC 19.42", "Rustc 1.84",
];

const AUDIO_GENRES = [
  "Ambient", "Electronic", "Lo-Fi", "Synthwave", "Indie", "Post-Rock", "Jazz", "Downtempo",
];

const TITLE_ADJS = [
  "Quiet", "Cobalt", "Glass", "Velvet", "Northern", "Amber", "Distant", "Silver", "Faded", "Luminous",
];

const TITLE_NOUNS = [
  "Harbor", "Signal", "Transit", "Echo", "Meridian", "Terrace", "Skyline", "Drift", "Archive", "Courtyard",
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// applies optional gps coordinate fuzzing to a "lat, lon" string
export function applyGpsJitter(gps: string, jitterGps: boolean): string {
  const parts = gps.split(",").map((s) => Number(s.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return gps.trim();
  if (!jitterGps) return `${parts[0].toFixed(5)}, ${parts[1].toFixed(5)}`;
  const lat = parts[0] + (Math.random() - 0.5) * 0.016;
  const lon = parts[1] + (Math.random() - 0.5) * 0.016;
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

// geocodes a real street address or place name using openstreetmap nominatim
export async function lookupRealAddress(query: string): Promise<CustomLocation | null> {
  const q = query.trim();
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("address lookup failed");
  const rows = (await res.json()) as Array<{
    lat?: string;
    lon?: string;
    display_name?: string;
    address?: Record<string, string | undefined>;
  }>;
  const hit = rows[0];
  if (!hit) return null;

  const a = hit.address ?? {};
  const house = a.house_number ?? "";
  const road = a.road ?? a.pedestrian ?? a.suburb ?? a.neighbourhood ?? "";
  const street = [house, road].filter(Boolean).join(" ").trim() || (hit.display_name?.split(",")[0] ?? q);
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? "";
  const state = a.state ?? a.region ?? a.province ?? "";
  const country = a.country ?? "";
  const lat = hit.lat ? Number(hit.lat).toFixed(5) : "";
  const lon = hit.lon ? Number(hit.lon).toFixed(5) : "";

  return {
    address: street,
    city,
    state,
    country,
    gps: lat && lon ? `${lat}, ${lon}` : "",
  };
}

export interface RandomGroupConfig {
  showLocation: boolean;
  locationLabel: string;
  identityLabel: string;
  deviceLabel: string;
  contentLabel: string;
}

// returns which randomize sections apply to a file category so irrelevant fields are never shown or written
export function getRandomGroupConfig(fileKind: FileCategory): RandomGroupConfig {
  if (fileKind === "app") {
    return {
      showLocation: false,
      locationLabel: "address & gps",
      identityLabel: "developer & legal",
      deviceLabel: "sdk & build date",
      contentLabel: "app name & version",
    };
  }
  if (fileKind === "audio") {
    return {
      showLocation: false,
      locationLabel: "address & gps",
      identityLabel: "artist & rights",
      deviceLabel: "encoder & year",
      contentLabel: "title, album & genre",
    };
  }
  if (fileKind === "document") {
    return {
      showLocation: false,
      locationLabel: "address & gps",
      identityLabel: "author & publisher",
      deviceLabel: "editor & date",
      contentLabel: "title & subject",
    };
  }
  if (fileKind === "image") {
    return {
      showLocation: true,
      locationLabel: "address & gps",
      identityLabel: "creator & rights",
      deviceLabel: "camera & software",
      contentLabel: "title & keywords",
    };
  }
  return {
    showLocation: true,
    locationLabel: "location & gps",
    identityLabel: "creator & rights",
    deviceLabel: "software & date",
    contentLabel: "title & description",
  };
}

export interface RandomizeOptions {
  includeLocation: boolean;
  includeIdentity: boolean;
  includeDevice: boolean;
  includeContent: boolean;
  locationMode?: "city" | "custom";
  customLocation?: CustomLocation;
  presetId: string | "random";
  jitterGps: boolean;
}

export function generateRandomAddress(presetId: string | "random" = "random", jitterGps = true): {
  preset: AddressPreset;
  address: string;
  city: string;
  state: string;
  country: string;
  gps: string;
} {
  const preset =
    presetId === "random"
      ? pick(ADDRESS_PRESETS)
      : (ADDRESS_PRESETS.find((p) => p.id === presetId) ?? pick(ADDRESS_PRESETS));

  const street = pick(preset.streets);
  let address: string;
  if (preset.fmt === "j") {
    address = `${randInt(1, 6)}-${randInt(1, 24)}-${randInt(1, 18)} ${street}`;
  } else if (preset.fmt === "s") {
    address = `${street} ${randInt(8, 260)}`;
  } else {
    address = `${randInt(12, 880)} ${street}`;
  }

  const jitterLat = jitterGps ? (Math.random() - 0.5) * 0.02 : 0;
  const jitterLon = jitterGps ? (Math.random() - 0.5) * 0.02 : 0;
  const lat = (preset.lat + jitterLat).toFixed(5);
  const lon = (preset.lon + jitterLon).toFixed(5);

  return {
    preset,
    address,
    city: preset.city,
    state: preset.state,
    country: preset.country,
    gps: `${lat}, ${lon}`,
  };
}

export function generateRandomMetadataPatch(
  fileKind: FileCategory,
  options: RandomizeOptions
): Partial<Record<StandardTextField, string>> {
  const patch: Partial<Record<StandardTextField, string>> = {};
  const cfg = getRandomGroupConfig(fileKind);
  const yearNum = 2021 + Math.floor(Math.random() * 6);
  const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
  const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, "0");
  const isoDate = `${yearNum}-${month}-${day}`;

  if (options.includeLocation && cfg.showLocation) {
    if (options.locationMode === "custom" && options.customLocation) {
      const c = options.customLocation;
      if (c.address.trim()) patch.address = c.address.trim();
      if (c.city.trim()) patch.city = c.city.trim();
      if (c.state.trim()) patch.state = c.state.trim();
      if (c.country.trim()) patch.country = c.country.trim();
      if (c.gps.trim()) patch.gps = applyGpsJitter(c.gps, options.jitterGps);
    } else {
      const loc = generateRandomAddress(options.presetId, options.jitterGps);
      patch.address = loc.address;
      patch.city = loc.city;
      patch.state = loc.state;
      patch.country = loc.country;
      patch.gps = loc.gps;
    }
  }

  if (options.includeIdentity) {
    const creator = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    const studio = pick(STUDIOS);
    const slug = studio.toLowerCase().replace(/[^a-z0-9]+/g, "");

    if (fileKind === "app") {
      patch.artist = studio;
      patch.copyright = `© ${yearNum} ${studio}`;
    } else if (fileKind === "audio") {
      patch.artist = creator;
      patch.albumArtist = creator;
      patch.copyright = `℗ ${yearNum} ${studio}`;
    } else if (fileKind === "document") {
      patch.artist = creator;
      patch.albumArtist = studio;
      patch.copyright = `© ${yearNum} ${studio}`;
    } else {
      patch.artist = creator;
      patch.albumArtist = studio;
      patch.copyright = `© ${yearNum} ${creator} / ${studio}`;
      patch.creditLine = `${studio} / ${creator}`;
      patch.source = studio;
      patch.licensorName = studio;
      patch.licensorId = `https://${slug}.example`;
      patch.licensorUrl = `https://${slug}.example/licensing`;
      patch.webStatement = `https://${slug}.example/rights`;
    }
  }

  if (options.includeDevice) {
    if (fileKind === "app") {
      patch.software = pick(APP_BUILD_TOOLS);
      patch.year = isoDate;
    } else if (fileKind === "audio") {
      patch.software = pick(AUDIO_ENCODERS);
      patch.year = String(yearNum);
    } else if (fileKind === "document") {
      patch.software = pick(DOC_EDITORS);
      patch.year = isoDate;
    } else if (fileKind === "image") {
      const cam = pick(CAMERAS);
      patch.cameraMake = cam.make;
      patch.cameraModel = cam.model;
      patch.software = pick(PHOTO_EDITORS);
      patch.year = isoDate;
    } else {
      patch.software = pick(PHOTO_EDITORS);
      patch.year = isoDate;
    }
  }

  if (options.includeContent) {
    const title = `${pick(TITLE_ADJS)} ${pick(TITLE_NOUNS)}`;
    patch.title = title;

    if (fileKind === "app") {
      const org = pick(STUDIOS).toLowerCase().replace(/[^a-z0-9]+/g, "");
      const appSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "");
      patch.albumArtist = `com.${org}.${appSlug}`;
      patch.album = `${randInt(1, 4)}.${randInt(0, 9)}.${randInt(0, 14)}`;
      patch.comment = `${title} release build`;
    } else if (fileKind === "audio") {
      patch.album = `${pick(TITLE_ADJS)} Sessions`;
      patch.genre = pick(AUDIO_GENRES);
      patch.bpm = String(78 + Math.floor(Math.random() * 68));
      patch.comment = `Mastered in ${yearNum}`;
    } else if (fileKind === "document") {
      patch.album = `${pick(TITLE_NOUNS)} Notes`;
      patch.genre = `${pick(TITLE_ADJS).toLowerCase()}, ${pick(TITLE_NOUNS).toLowerCase()}`;
      patch.comment = `Drafted ${isoDate}`;
    } else if (fileKind === "image") {
      patch.headline = `${title} — Editorial Edition`;
      patch.genre = `${pick(TITLE_ADJS).toLowerCase()}, ${pick(TITLE_NOUNS).toLowerCase()}, editorial`;
      patch.comment = `Captured on location (${isoDate})`;
    } else {
      patch.comment = `Archived ${isoDate}`;
    }
  }

  return patch;
}

export function applyPatchToMetadata(
  base: TrackMetadata,
  patch: Partial<Record<StandardTextField, string>>
): TrackMetadata {
  return {
    ...base,
    ...patch,
    customTags: { ...base.customTags },
  };
}
