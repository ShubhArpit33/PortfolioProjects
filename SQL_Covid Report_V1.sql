
--Select *
--From PortfolioProject..CovidDeaths$
--Where continent is not null
--order by 3,4


--Select the Data we are going to use
 
SELECT Location, date, total_cases, new_cases, total_deaths, population
FROM PortfolioProject..CovidDeaths$
WHERE continent is not null
ORDER BY 1,2


--Looking at Total Cases vs Total Deaths
--Shows likelihood of dying if you contracted Covid in your country

SELECT Location, date, total_cases, total_deaths, (total_deaths/total_cases)*100 AS DeathPercentage
FROM PortfolioProject..CovidDeaths$
WHERE location like '%india'
WHERE continent is not null
ORDER BY 1,2


--Let's look at Total Cases vs Population
--Shows percentage of population who got Covid

SELECT Location, date, population, total_cases, (total_cases/population)*100 AS CasePercentage
FROM PortfolioProject..CovidDeaths$
WHERE continent is not null
ORDER BY 1,2


--Looking at Countries with Highest Infection Rate compared to Population

SELECT location, population, MAX(total_cases) as HighestInfectionCount, MAX((total_cases/population))*100 AS PercentPopulationInfected
FROM PortfolioProject..CovidDeaths$
WHERE continent is not null
GROUP BY location, population
ORDER BY PercentPopulationInfected Desc





--Showing Countries with Highest Death Count per Population

SELECT location, MAX(cast(total_deaths as int)) as TotalDeathCount
FROM PortfolioProject..CovidDeaths$
WHERE continent is not null
GROUP BY location
ORDER BY TotalDeathCount Desc


--Let's break things down by Continent

--Showing Continents Highest Death Count per Population

SELECT continent, MAX(cast(total_deaths as int)) As TotalDeathCount
FROM PortfolioProject..CovidDeaths$
WHERE continent is not null
GROUP BY continent
ORDER BY TotalDeathCount Desc


--GLOBAL NUMBERS

SELECT date, SUM(new_cases) As TotalCases, SUM(Cast(new_deaths As int)) As TotalDeaths, 
	(SUM(Cast(new_deaths As int))/SUM(new_cases))*100 As DeathPercentage
FROM PortfolioProject..CovidDeaths$
WHERE continent is not null
GROUP BY date
ORDER BY 1,2



--Sum of Deaths and Cases updated upto 2021

SELECT SUM(new_cases) As TotalCases, SUM(Cast(new_deaths As int)) As TotalDeaths, 
	(SUM(Cast(new_deaths As int))/SUM(new_cases))*100 As DeathPercentage
FROM PortfolioProject..CovidDeaths$
WHERE continent is not null
ORDER BY 1,2



-- Looking at Total Population vs Vaccinations

SELECT dea.continent, dea.location, dea.date, dea.population, vac.new_vaccinations
, SUM(Cast(vac.new_vaccinations As int)) OVER (Partition by dea.location Order by dea.location, dea.date )
  as RollingPeopleVaccinated
--, (RollingPeopleVaccinated/population)*100
FROM PortfolioProject..CovidDeaths$ dea
JOIN PortfolioProject..CovidVaccinations$ vac
	ON dea.location = vac.location
	AND dea.date = vac.date
WHERE dea.continent is not Null
ORDER BY 2,3


--USE CTE

WITH PopvsVac (Continent, Location, Date, Population, New_vaccinations, RollingPeopleVaccinated)
As
(
SELECT dea.continent, dea.location, dea.date, dea.population, vac.new_vaccinations
, SUM(Cast(vac.new_vaccinations As int)) OVER (Partition by dea.location Order by dea.location, dea.date )
  as RollingPeopleVaccinated
--, (RollingPeopleVaccinated/population)*100
FROM PortfolioProject..CovidDeaths$ dea
JOIN PortfolioProject..CovidVaccinations$ vac
	ON dea.location = vac.location
	AND dea.date = vac.date
WHERE dea.continent is not Null
)

SELECT *, (RollingPeopleVaccinated/Population)*100 As PercentPopulationVaccinated
FROM PopvsVac



-- Create view to store data for later vizualisations

Create View PercentPopulationVaccinated As
SELECT dea.continent, dea.location, dea.date, dea.population, vac.new_vaccinations
, SUM(Cast(vac.new_vaccinations As int)) OVER (Partition by dea.location Order by dea.location, dea.date )
  as RollingPeopleVaccinated
--, (RollingPeopleVaccinated/population)*100
FROM PortfolioProject..CovidDeaths$ dea
JOIN PortfolioProject..CovidVaccinations$ vac
	ON dea.location = vac.location
	AND dea.date = vac.date
WHERE dea.continent is not Null


SELECT *
FROM PercentPopulationVaccinated