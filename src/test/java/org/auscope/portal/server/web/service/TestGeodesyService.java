package org.auscope.portal.server.web.service;

import java.io.InputStream;
import java.net.ConnectException;
import java.util.List;

import org.apache.commons.httpclient.HttpMethodBase;
import org.auscope.portal.core.server.http.HttpServiceCaller;
import org.auscope.portal.core.services.PortalServiceException;
import org.auscope.portal.core.services.methodmakers.WFSGetFeatureMethodMaker;
import org.auscope.portal.core.services.methodmakers.WFSGetFeatureMethodMaker.ResultType;
import org.auscope.portal.core.test.PortalTestClass;
import org.auscope.portal.core.test.ResourceUtil;
import org.auscope.portal.server.domain.geodesy.GeodesyObservation;
import org.auscope.portal.server.domain.geodesy.GeodesyObservationsFilter;
import org.jmock.Expectations;
import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;

public class TestGeodesyService extends PortalTestClass {
    private HttpMethodBase mockMethod = context.mock(HttpMethodBase.class);
    private HttpServiceCaller mockServiceCaller = context.mock(HttpServiceCaller.class);
    private WFSGetFeatureMethodMaker mockMethodMaker = context.mock(WFSGetFeatureMethodMaker.class);
    private GeodesyService gs;

    @Before
    public void init() {
        gs = new GeodesyService(mockServiceCaller, mockMethodMaker);
    }

    /**
     * Tests request making and parsing
     * @throws Exception
     */
    @Test
    public void testGetObservations() throws Exception {
        final String serviceUrl = "http://example.com/wfs";
        final String stationId = "statioNid";
        final String startDate = "1986-10-09";
        final String endDate = "1990-12-13";
        final String filterString = new GeodesyObservationsFilter(stationId, startDate, endDate).getFilterStringAllRecords();
        final InputStream is = ResourceUtil.loadResourceAsStream("org/auscope/portal/geodesy/GeodesyStationObservationsResponse.xml");

        context.checking(new Expectations() {{
            oneOf(mockMethodMaker).makePostMethod(with(equal(serviceUrl)), with(equal("geodesy:station_observations")), with(equal(filterString)), with(any(Integer.class)), with(any(String.class)), with(equal(ResultType.Results)), with(equal((String) null)));will(returnValue(mockMethod));

            oneOf(mockServiceCaller).getMethodResponseAsStream(mockMethod);will(returnValue(is));

            oneOf(mockMethod).releaseConnection();
        }});

        List<GeodesyObservation> result = gs.getObservationsForStation(serviceUrl, stationId, startDate, endDate);
        Assert.assertNotNull(result);
        Assert.assertEquals(3, result.size());

        Assert.assertEquals("parc", result.get(0).getStationId());
        Assert.assertEquals("1999-12-06Z", result.get(0).getDate());
        Assert.assertEquals("http://siss2.anu.edu.au/geodesy-mirror/daily/1999/99341/parc3410.99d.Z", result.get(0).getUrl());

        Assert.assertEquals("pert", result.get(1).getStationId());
        Assert.assertEquals("1999-11-01Z", result.get(1).getDate());
        Assert.assertEquals("http://siss2.anu.edu.au/geodesy-mirror/daily/1999/99341/pert3410.99d.Z", result.get(1).getUrl());

        Assert.assertEquals("petp", result.get(2).getStationId());
        Assert.assertEquals("1999-12-06Z", result.get(2).getDate());
        Assert.assertEquals("http://siss2.anu.edu.au/geodesy-mirror/daily/1999/99341/petp3410.99d.Z", result.get(2).getUrl());
    }

    /**
     * Tests request making and parsing
     * @throws Exception
     */
    @Test(expected=PortalServiceException.class)
    public void testServiceUnreachable() throws Exception {
        final String serviceUrl = "http://example.com/wfs";
        final String stationId = "statioNid";
        final String startDate = "1986-10-09";
        final String endDate = "1990-12-13";
        final String filterString = new GeodesyObservationsFilter(stationId, startDate, endDate).getFilterStringAllRecords();

        context.checking(new Expectations() {{
            oneOf(mockMethodMaker).makePostMethod(with(equal(serviceUrl)), with(equal("geodesy:station_observations")), with(equal(filterString)), with(any(Integer.class)), with(any(String.class)), with(equal(ResultType.Results)), with(equal((String) null)));will(returnValue(mockMethod));

            allowing(mockMethod).getURI();
            oneOf(mockMethod).releaseConnection();

            oneOf(mockServiceCaller).getMethodResponseAsStream(mockMethod);will(throwException(new ConnectException()));
        }});

        gs.getObservationsForStation(serviceUrl, stationId, startDate, endDate);
    }
}
