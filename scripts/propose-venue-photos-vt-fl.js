#!/usr/bin/env node
/**
 * Propose Wikimedia Commons photos for Vermont and Florida.
 * Never writes venues.json. A row is a proposal until a person accepts it.
 *
 * Usage: node scripts/propose-venue-photos-vt-fl.js
 * Writes: docs/sources/proposals/venue-photos-vt-fl.md
 */
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const outPath = join(root, 'docs/sources/proposals/venue-photos-vt-fl.md');
const FORBIDDEN = ['data/venues.json', 'data/spots.ts'];

const PROPOSALS = [
  {
    "venue": "Aldrich Public Library",
    "locality": "Barre City",
    "file": "File:Aldrich Public Library, Barre Vermont.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "Kenneth C. Zirkel",
    "why": "The Aldrich Public Library in Barre. PUBLIC LIBRARY is over the door.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Aldrich_Public_Library,_Barre_Vermont.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Holley Hall",
    "locality": "Bristol",
    "file": "File:Holley Hall in Bristol, Vermont.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "MConradWard",
    "why": "Holley Hall, the brick town hall with the clock tower in Bristol, Vermont. A Holley Hall at a college in Texas was not used.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Holley_Hall_in_Bristol,_Vermont.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "First United Methodist Church Burlington Vermont",
    "locality": "Burlington",
    "file": "File:First United Methodist Church Burlington Vermont.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "Beyond My Ken",
    "why": "The steeple of the First United Methodist Church in Burlington. The file names this church, not another one with the same name.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:First_United_Methodist_Church_Burlington_Vermont.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Fletcher Free Library Main Library",
    "locality": "Burlington",
    "file": "File:Fletcher Free Library Burlington Vermont entrance.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "Beyond My Ken",
    "why": "The College Street entrance of the Fletcher Free Library. LIBRARY is carved over the door. A book-sale banner is hanging in front.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Fletcher_Free_Library_Burlington_Vermont_entrance.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Mahaney Arts Center",
    "locality": "Middlebury",
    "file": "File:Mahaney Center for the Arts.jpg",
    "license": "CC0",
    "credit": "Kenneth James Burchfiel III",
    "why": "The Mahaney Center for the Arts at Middlebury College. The file is from a tour of that building on the campus.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Mahaney_Center_for_the_Arts.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Middlebury Chapel",
    "locality": "Middlebury",
    "file": "File:Mead Memorial Chapel and Gifford Hall, Middlebury College, Middlebury, Vermont (84573).jpg",
    "license": "Public domain",
    "credit": "Tichnor Brothers, Publisher",
    "why": "The college chapel. It was Mead Memorial Chapel until 2021 and is now Middlebury Chapel, the same building. This is a public-domain postcard of that chapel, and the caption on it names Middlebury.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Mead_Memorial_Chapel_and_Gifford_Hall,_Middlebury_College,_Middlebury,_Vermont_(84573).jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Kellogg-Hubbard Library",
    "locality": "Montpelier",
    "file": "File:Kellogg-Hubbard Library, Montpelier.jpg",
    "license": "CC BY 4.0",
    "credit": "Kenneth C. Zirkel",
    "why": "The stone Kellogg-Hubbard Library on Main Street in Montpelier. The file names that library.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Kellogg-Hubbard_Library,_Montpelier.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Royalton Memorial Library",
    "locality": "Royalton",
    "file": "File:Royalton Memorial Library.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "Ɱ",
    "why": "The Royalton Memorial Library. The Commons description names this library. It is a house-shaped building, which is the library.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Royalton_Memorial_Library.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Shelburne Museum",
    "locality": "Shelburne",
    "file": "File:Shelburne Museum Round Barn 2019.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "NRavenel",
    "why": "The round barn on the grounds of the Shelburne Museum. It is one building at the museum, not a view of the whole place.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Shelburne_Museum_Round_Barn_2019.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Bixby Memorial Free Library",
    "locality": "Vergennes",
    "file": "File:Bixby Memorial Free Library.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "Araef15",
    "why": "The columned entrance of the Bixby Memorial Free Library in Vergennes. The file is that building.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Bixby_Memorial_Free_Library.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Norman Williams Public Library",
    "locality": "Woodstock",
    "file": "File:Norman Williams Public Library, Woodstock, Vermont.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "Kenneth C. Zirkel",
    "why": "The stone Norman Williams Public Library in Woodstock, Vermont. The file names that library.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Norman_Williams_Public_Library,_Woodstock,_Vermont.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Clearwater Main Library",
    "locality": "Clearwater",
    "file": "File:Clearwater-Main-Library.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "Possibilibrary",
    "why": "The Clearwater Main Library and the pond in front of it. The file description names this branch.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Clearwater-Main-Library.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Fairchild Tropical Botanic Garden",
    "locality": "Coral Gables",
    "file": "File:Fairchild Tropical Botanic Garden kz06.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "Krzysztof Ziarnek, Kenraiz",
    "why": "A garden walk at Fairchild Tropical Botanic Garden in Coral Gables. The file names that garden.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Fairchild_Tropical_Botanic_Garden_kz06.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Dunedin Fine Art Center",
    "locality": "Dunedin",
    "file": "File:FL Dunedin Fine Art Center01.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "Ebyabe",
    "why": "The wall reads DUNEDIN FINE ART CENTER. This is the center in Dunedin, Florida, not a library in New Zealand.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:FL_Dunedin_Fine_Art_Center01.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Cummer Museum of Art & Gardens",
    "locality": "Jacksonville",
    "file": "File:Cummer Museum, Jacksonville, FL, US.jpg",
    "license": "CC BY-SA 3.0",
    "credit": "bubba73",
    "why": "The Cummer Museum building in Jacksonville. The file names that museum.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Cummer_Museum,_Jacksonville,_FL,_US.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Friendship Fountain",
    "locality": "Jacksonville",
    "file": "File:Jacksonville Friendship Fountain.jpg",
    "license": "CC BY-SA 3.0",
    "credit": "Jonathan Zander",
    "why": "Friendship Fountain in Jacksonville, with the downtown towers behind the water.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Jacksonville_Friendship_Fountain.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Riverside Arts Market",
    "locality": "Jacksonville",
    "file": "File:Riverside Arts Market (RAM).jpg",
    "license": "CC BY-SA 4.0",
    "credit": "Riley Madison",
    "why": "The banner reads HOME OF THE RIVERSIDE ARTS MARKET. This is the market under the bridge, not a nearby street.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Riverside_Arts_Market_(RAM).jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Pinellas County Heritage Village",
    "locality": "Largo",
    "file": "File:Pinellas County Heritage Village House January 20, 2021 1 .JPG",
    "license": "CC BY-SA 4.0",
    "credit": "Philipp Michel Reichold",
    "why": "One historic house inside Pinellas County Heritage Village. It is a building in the village, not a view of the whole site.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Pinellas_County_Heritage_Village_House_January_20,_2021_1_.JPG",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Pérez Art Museum Miami",
    "locality": "Miami",
    "file": "File:Perez Art Museum Miami.jpg",
    "license": "CC BY-SA 3.0",
    "credit": "B137",
    "why": "The facade reads Jorge M. Pérez Art Museum of Miami-Dade County. This is the Pérez Art Museum Miami.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Perez_Art_Museum_Miami.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Vizcaya Museum and Gardens",
    "locality": "Miami",
    "file": "File:Villa Vizcaya 20110228.jpg",
    "license": "CC BY 3.0",
    "credit": "Averette",
    "why": "The villa and the formal garden at Vizcaya on Biscayne Bay. A photo of only the stone barge was not used.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Villa_Vizcaya_20110228.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Wynwood Walls",
    "locality": "Miami",
    "file": "File:Wynwood Walls (9969056203).jpg",
    "license": "CC BY 2.0",
    "credit": "Phillip Pessar",
    "why": "The mural courtyard at Wynwood Walls in Miami. The file names those walls, not a mural on a nearby street.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Wynwood_Walls_(9969056203).jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "South Pointe Park",
    "locality": "Miami Beach",
    "file": "File:South Pointe Park - panoramio.jpg",
    "license": "CC BY 3.0",
    "credit": "Bohao Zhao",
    "why": "South Pointe Park in Miami Beach, with the striped marker tower on the waterfront.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:South_Pointe_Park_-_panoramio.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Tampa Bay Automobile Museum",
    "locality": "Pinellas Park",
    "file": "File:Tampa Automobile Museum (2295594438).jpg",
    "license": "CC BY-SA 2.0",
    "credit": "dave_7",
    "why": "The Tampa Bay Automobile Museum. The name is painted on the building.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Tampa_Automobile_Museum_(2295594438).jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Daddy Kool Records",
    "locality": "St. Petersburg",
    "file": "File:Daddy Kool Records, St Petersburg, Florida.jpg",
    "license": "CC BY 4.0",
    "credit": "Pokemonprime",
    "why": "The sign reads Daddy Kool Records, St. Petersburg, FL.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Daddy_Kool_Records,_St_Petersburg,_Florida.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Dr. Carter G. Woodson African American Museum",
    "locality": "St. Petersburg",
    "file": "File:2024-Woodson African American Museum of Florida- 02.jpg",
    "license": "CC BY 4.0",
    "credit": "Myotus",
    "why": "The sign reads DR. CARTER G. WOODSON AFRICAN AMERICAN HISTORY MUSEUM, at 2240 9th Avenue South, the museum's address. An interior with a visitor in it was not used.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:2024-Woodson_African_American_Museum_of_Florida-_02.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Imagine Museum",
    "locality": "St. Petersburg",
    "file": "File:Imagine Museum St. Petersburg front.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "Adog",
    "why": "The front of the Imagine Museum in St. Petersburg. The banners say contemporary glass, which is what this museum shows.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Imagine_Museum_St._Petersburg_front.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Mirror Lake Community Library",
    "locality": "St. Petersburg",
    "file": "File:St Petersburg, FL - Mirror Lake - Mirror Lake Community Library (1).jpg",
    "license": "CC BY-SA 4.0",
    "credit": "Jrozwado",
    "why": "The historic library building at Mirror Lake in St. Petersburg. The file names the Mirror Lake Community Library.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:St_Petersburg,_FL_-_Mirror_Lake_-_Mirror_Lake_Community_Library_(1).jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Morean Arts Center",
    "locality": "St. Petersburg",
    "file": "File:St. Pete Arts Center01.jpg",
    "license": "CC BY-SA 3.0",
    "credit": "Ebyabe",
    "why": "The glass building of the St. Petersburg Arts Center, which is now the Morean Arts Center at 719 Central Avenue.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:St._Pete_Arts_Center01.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Museum of Fine Arts St. Petersburg",
    "locality": "St. Petersburg",
    "file": "File:Museum of Fine Arts in St Petersburg, FL.jpg",
    "license": "CC BY 2.0",
    "credit": "Calmuziclover",
    "why": "The Museum of Fine Arts building in St. Petersburg at night. The file names that museum.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Museum_of_Fine_Arts_in_St_Petersburg,_FL.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "St. Pete Pier",
    "locality": "St. Petersburg",
    "file": "File:St. Pete Pier - East.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "Jackdude101",
    "why": "The current St. Pete Pier building over the water. A 2015 photo of the old pier, since demolished, was not used.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:St._Pete_Pier_-_East.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "St. Petersburg Shuffleboard Club",
    "locality": "St. Petersburg",
    "file": "File:The St. Petersburg Shuffleboard Club.jpg",
    "license": "CC0",
    "credit": "KellyDoyle",
    "why": "Inside the St. Petersburg Shuffleboard Club. A sign on the shelf reads ST. PETERSBURG SHUFFLEBOARD CLUB.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:The_St._Petersburg_Shuffleboard_Club.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Tampa Bay Watch Discovery Center",
    "locality": "St. Petersburg",
    "file": "File:Tampa Bay Watch Discovery Center (54358729070).jpg",
    "license": "CC BY 2.0",
    "credit": "ajay_suresh",
    "why": "The Tampa Bay Watch Discovery Center at the St. Pete Pier. The file names that center.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Tampa_Bay_Watch_Discovery_Center_(54358729070).jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "The Dalí Museum",
    "locality": "St. Petersburg",
    "file": "File:St. Pete Dali Museum03.jpg",
    "license": "CC BY-SA 3.0",
    "credit": "Ebyabe",
    "why": "The glass building of the Salvador Dalí Museum in St. Petersburg. This is the current museum, not the old Tampa building.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:St._Pete_Dali_Museum03.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "The James Museum of Western & Wildlife Art",
    "locality": "St. Petersburg",
    "file": "File:James Museum of Western and Wildlife Art.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "LittleT889",
    "why": "The entrance of the James Museum of Western and Wildlife Art in St. Petersburg. The file names that museum.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:James_Museum_of_Western_and_Wildlife_Art.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Alfred B. Maclay Gardens State Park",
    "locality": "Tallahassee",
    "file": "File:Maclay House, Alfred B. Maclay Gardens State Park.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "Michael Rivera",
    "why": "The Maclay house inside Alfred B. Maclay Gardens State Park. An interior of the house was not used.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Maclay_House,_Alfred_B._Maclay_Gardens_State_Park.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Askew Student Life Center",
    "locality": "Tallahassee",
    "file": "File:Reubin O'D. Askew Student Life Center at Florida State University.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "The Bushranger",
    "why": "The Reubin O'D. Askew Student Life Center. That name is carved over the door at Florida State.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Reubin_O'D._Askew_Student_Life_Center_at_Florida_State_University.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Capital City Amphitheater at Cascades Park",
    "locality": "Tallahassee",
    "file": "File:Capital City Amphitheater at Cascades Park.jpeg",
    "license": "CC BY 3.0",
    "credit": "Larcolt",
    "why": "The bandshell and lawn of the Capital City Amphitheater at Cascades Park. The file names that stage.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Capital_City_Amphitheater_at_Cascades_Park.jpeg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Challenger Learning Center",
    "locality": "Tallahassee",
    "file": "File:Kleman Plaza Challenger Learning Center entrance.JPG",
    "license": "CC BY-SA 3.0",
    "credit": "Michael Rivera",
    "why": "The Challenger Learning Center entrance at Kleman Plaza in Tallahassee. A Challenger center in Colorado was not used.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Kleman_Plaza_Challenger_Learning_Center_entrance.JPG",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Dunlap Student Success Center",
    "locality": "Tallahassee",
    "file": "File:Dunlap Student Success Center at Florida State University.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "SeminoleNation",
    "why": "The Dunlap Student Success Center at Florida State. The file names that building.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Dunlap_Student_Success_Center_at_Florida_State_University.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Eastside Branch Library",
    "locality": "Tallahassee",
    "file": "File:Eastside Branch Library, Leon County, Florida.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "The Bushranger",
    "why": "The Eastside Branch of the Leon County library. The building is at the end of the drive, and the file description names this branch.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Eastside_Branch_Library,_Leon_County,_Florida.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Florida Historic Capitol Museum",
    "locality": "Tallahassee",
    "file": "File:Old Florida State Capitol, Dome, Tallahassee 20160711 1.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "DXR",
    "why": "The dome of the old Florida capitol, which is the Florida Historic Capitol Museum. The new capitol tower is the striped building behind it.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Old_Florida_State_Capitol,_Dome,_Tallahassee_20160711_1.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Foster-Tanner Fine Arts Gallery",
    "locality": "Tallahassee",
    "file": "File:Tallahassee FL Foster-Tanner Fine Arts Gallery02.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "Ebyabe",
    "why": "The Foster-Tanner Fine Arts Gallery in Tallahassee. The file names that gallery.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Tallahassee_FL_Foster-Tanner_Fine_Arts_Gallery02.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "FSU Museum of Fine Arts",
    "locality": "Tallahassee",
    "file": "File:FSU Museum of Fine Arts.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "The Bushranger",
    "why": "The FSU Museum of Fine Arts. MUSEUM OF FINE ARTS is on the wall by the door.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:FSU_Museum_of_Fine_Arts.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "FSU Student Union",
    "locality": "Tallahassee",
    "file": "File:FSU Student Union.jpg",
    "license": "CC BY 2.0",
    "credit": "Lindsay Clark",
    "why": "The Florida State University student union at night. The file description names that building.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:FSU_Student_Union.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Goodwood Museum & Gardens",
    "locality": "Tallahassee",
    "file": "File:Goodwood Plantation Tallahassee.JPG",
    "license": "CC BY-SA 3.0",
    "credit": "Mudangel",
    "why": "The main house at Goodwood Museum & Gardens in Tallahassee, seen from the grounds.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Goodwood_Plantation_Tallahassee.JPG",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Lake Jackson Branch Library",
    "locality": "Tallahassee",
    "file": "File:Lake Jackson Branch Library.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "The Bushranger",
    "why": "The Lake Jackson Branch Library. LIBRARY is on the building, and the file names this branch.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Lake_Jackson_Branch_Library.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Lake Jackson Mounds Archaeological State Park",
    "locality": "Tallahassee",
    "file": "File:Tallahassee FL Lake Jackson Mounds SP mound01a.jpg",
    "license": "CC BY-SA 3.0",
    "credit": "Ebyabe",
    "why": "Stairs up a temple mound at Lake Jackson Mounds Archaeological State Park. The file names that park.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Tallahassee_FL_Lake_Jackson_Mounds_SP_mound01a.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "LeMoyne Arts Gallery & Gardens",
    "locality": "Tallahassee",
    "file": "File:LeMoyne Art Center - Tallahassee, Florida.jpg",
    "license": "Public domain",
    "credit": "Unknown photographer",
    "why": "The historic house at 125 North Gadsden Street that is LeMoyne Arts, earlier called the LeMoyne Art Center. The photographer is not named. The file is public domain.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:LeMoyne_Art_Center_-_Tallahassee,_Florida.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "LeRoy Collins Leon County Main Library",
    "locality": "Tallahassee",
    "file": "File:Leroy Collins Leon County Public Library from Park Ave.JPG",
    "license": "CC BY-SA 3.0",
    "credit": "Michael Rivera",
    "why": "The main library in Tallahassee. The sign on the building reads LeRoy Collins Leon County Public Library.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Leroy_Collins_Leon_County_Public_Library_from_Park_Ave.JPG",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Mission San Luis",
    "locality": "Tallahassee",
    "file": "File:Replica of Apalachee council house at Mission San Luis- Tallahassee, Florida (7307794334).jpg",
    "license": "Public domain",
    "credit": "Florida Memory",
    "why": "The reconstructed Apalachee council house at Mission San Luis in Tallahassee. The California mission, San Luis Rey, was not used.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Replica_of_Apalachee_council_house_at_Mission_San_Luis-_Tallahassee,_Florida_(7307794334).jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Museum of Florida History at R.A. Gray Building",
    "locality": "Tallahassee",
    "file": "File:Tallahassee Museum of Florida History01.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "Ebyabe",
    "why": "The Museum of Florida History in Tallahassee, in the R.A. Gray Building. A MUSEUM banner is on the building. This is not the Tallahassee Museum on Museum Drive, which is a different place and has no photo here.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Tallahassee_Museum_of_Florida_History01.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Proof Brewing Company",
    "locality": "Tallahassee",
    "file": "File:Proof Brewing Company, Tallahassee, Florida.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "The Bushranger",
    "why": "The Proof Brewing Company building in Tallahassee. PROOF is on the tank beside the building.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Proof_Brewing_Company,_Tallahassee,_Florida.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "The Grove Museum",
    "locality": "Tallahassee",
    "file": "File:The Call-Collins House, The Grove- Tallahassee, Florida (7157983334).jpg",
    "license": "Public domain",
    "credit": "Florida Memory",
    "why": "The Call-Collins House, which is The Grove Museum in Tallahassee.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:The_Call-Collins_House,_The_Grove-_Tallahassee,_Florida_(7157983334).jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Theatre Tallahassee",
    "locality": "Tallahassee",
    "file": "File:Theatre Tallahassee.JPG",
    "license": "CC BY-SA 3.0",
    "credit": "Michael Rivera",
    "why": "Theatre Tallahassee at 1861 Thomasville Road. The file description gives that address.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Theatre_Tallahassee.JPG",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Tom Brown Park",
    "locality": "Tallahassee",
    "file": "File:Tom Brown Park.jpg",
    "license": "CC BY 2.0",
    "credit": "Paul Clark",
    "why": "The sign reads WELCOME TO TOM BROWN PARK. This is the park in Tallahassee, not a person named Tom Brown.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Tom_Brown_Park.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "C. Blythe Andrews, Jr. Public Library",
    "locality": "Tampa",
    "file": "File:Front exterior of C. Blythe Andrews, Jr. Public Library in Tampa, Florida, US, on 9 August 2026 (02).jpg",
    "license": "CC BY-SA 4.0",
    "credit": "MatthewHoobin",
    "why": "The awning reads C. BLYTHE ANDREWS, JR. PUBLIC LIBRARY. This is that Tampa branch.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Front_exterior_of_C._Blythe_Andrews,_Jr._Public_Library_in_Tampa,_Florida,_US,_on_9_August_2026_(02).jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Centro Asturiano de Tampa",
    "locality": "Tampa",
    "file": "File:Centro Asturiano de Tampa; North Nebraska & East Palm Avenues.JPG",
    "license": "CC BY-SA 3.0",
    "credit": "DanTD",
    "why": "The historic Centro Asturiano building in Tampa. The file names that club.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Centro_Asturiano_de_Tampa;_North_Nebraska_&_East_Palm_Avenues.JPG",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Glazer Children's Museum",
    "locality": "Tampa",
    "file": "File:Glazer Children's Museum.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "James E. Scholz",
    "why": "The Glazer Children's Museum in Tampa. The file names that building.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Glazer_Children's_Museum.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Henry B. Plant Museum",
    "locality": "Tampa",
    "file": "File:Henry B. Plant Museum from Tampa Riverwalk, Tampa, Florida 2024.jpg",
    "license": "CC BY-SA 2.0",
    "credit": "Ken Lund",
    "why": "The old Tampa Bay Hotel, seen from the river. That building houses the Henry B. Plant Museum.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Henry_B._Plant_Museum_from_Tampa_Riverwalk,_Tampa,_Florida_2024.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "John F. Germany Public Library",
    "locality": "Tampa",
    "file": "File:John F. Germany Public Library, Tampa, Florida 2024.jpg",
    "license": "CC BY-SA 2.0",
    "credit": "Ken Lund",
    "why": "The sign in front reads JOHN F. GERMANY PUBLIC LIBRARY. This is the Tampa main library.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:John_F._Germany_Public_Library,_Tampa,_Florida_2024.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "North Tampa Branch Library",
    "locality": "Tampa",
    "file": "File:North Tampa Branch Library.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "Shedriek",
    "why": "The sign reads NORTH TAMPA BRANCH LIBRARY.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:North_Tampa_Branch_Library.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Robert W. Saunders, Sr. Public Library",
    "locality": "Tampa",
    "file": "File:Robert saunders branch today.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "Nyemelis",
    "why": "The Robert W. Saunders, Sr. Public Library. The name is on the building.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Robert_saunders_branch_today.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Tampa Bay History Center",
    "locality": "Tampa",
    "file": "File:Tampa Bay History Center.jpg",
    "license": "Public domain",
    "credit": "Christopher Hollis",
    "why": "The Tampa Bay History Center. The name is on the building.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Tampa_Bay_History_Center.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Tampa Firefighters Museum",
    "locality": "Tampa",
    "file": "File:FireMuseumTampa01.jpg",
    "license": "CC BY 2.5",
    "credit": "Ebyabe",
    "why": "Old Fire Station No. 1 in Tampa, the building of the Tampa Firefighters Museum. The file says it was being turned into that museum.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:FireMuseumTampa01.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Tampa Theatre",
    "locality": "Tampa",
    "file": "File:Tampa Theatre 2013.jpg",
    "license": "CC BY-SA 3.0",
    "credit": "MarieG33",
    "why": "The theatre at 711 Franklin Street. The vertical sign reads TAMPA and the marquee is the theatre's own.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Tampa_Theatre_2013.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "The SpookEasy Lounge",
    "locality": "Tampa",
    "file": "File:SpookEasy Lounge sign, Ybor City, Tampa, Florida, 11 October 2023.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "MatthewHoobin",
    "why": "The sign reads SPOOKEASY LOUNGE, at the lounge in Ybor City.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:SpookEasy_Lounge_sign,_Ybor_City,_Tampa,_Florida,_11_October_2023.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "USF Botanical Gardens",
    "locality": "Tampa",
    "file": "File:USF Botanical Garden6.JPG",
    "license": "CC BY-SA 3.0",
    "credit": "Ssriram mt",
    "why": "A planted bed at the USF Botanical Gardens. The file names that garden.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:USF_Botanical_Garden6.JPG",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "West Tampa Library",
    "locality": "Tampa",
    "file": "File:West Tampa Free Public Library.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "James E. Scholz",
    "why": "The columned entrance of the West Tampa Free Public Library, the historic building that is the West Tampa Library.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:West_Tampa_Free_Public_Library.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Leepa-Rattner Museum of Art",
    "locality": "Tarpon Springs",
    "file": "File:FL Tarpon Springs Leepa-Rattner Museum of Art01.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "Ebyabe",
    "why": "The wall reads LEEPA-RATTNER Museum of Art, in Tarpon Springs.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:FL_Tarpon_Springs_Leepa-Rattner_Museum_of_Art01.jpg",
    "checkedOn": "2026-10-17"
  }
];

function page(file) {
  return 'https://commons.wikimedia.org/wiki/' + encodeURI(file.replace(/ /g, '_'));
}

function renderLedger(list) {
  const lines = [
    '# Venue photo proposals, Vermont and Florida',
    '',
    'Review file only. This does not change `data/venues.json`.',
    '',
    'Source: Wikimedia Commons, option A. Checked 2026-10-17.',
    'Searched: 40 venues in Vermont and 175 in Florida, 215 in all. Proposed: ' + list.length + '. The rest had no file that was clearly that place.',
    '',
    'A file of a different city, a picture of a person, or a frame of only trees was not proposed. Pierson Library matched a Yale library. Young Actors Theatre matched a theatre in London. Those were dropped.',
    '',
    'A row is not in the app until a person agrees the picture is that place. No image is better than a wrong image.',
    '',
    '| Venue | File | License | Credit | Why it matches |',
    '|---|---|---|---|---|',
  ];
  for (const row of list) {
    const link = '[' + row.file.replace(/^File:/, '').replace(/\|/g, '\\|') + '](' + row.sourcePage + ')';
    const why = row.why.replace(/\|/g, '\\|');
    lines.push('| ' + row.venue.replace(/\|/g, '\\|') + ' | ' + link + ' | ' + row.license + ' | ' + row.credit.replace(/\|/g, '\\|') + ' | ' + why + ' |');
  }
  lines.push('');
  return lines.join('\n');
}

function assertReviewOnly(path) {
  const normalized = path.replace(/\\/g, '/');
  if (FORBIDDEN.some((banned) => normalized.endsWith(banned))) {
    throw new Error('refusing to write ' + path);
  }
}

function main() {
  for (const row of PROPOSALS) {
    if (!row.sourcePage.startsWith('https://commons.wikimedia.org/wiki/File:')) {
      throw new Error('not a Commons file page: ' + row.venue);
    }
    if (page(row.file) !== row.sourcePage) throw new Error('page does not match file: ' + row.venue);
  }
  assertReviewOnly(outPath);
  writeFileSync(outPath, renderLedger(PROPOSALS));
  console.log('wrote ' + PROPOSALS.length + ' proposals to ' + outPath);
}

if (require.main === module) main();

module.exports = { PROPOSALS, renderLedger, assertReviewOnly };
