import { EC2Client, Instance, paginateDescribeInstances, paginateDescribeVolumes, Volume } from '@aws-sdk/client-ec2'
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm'
import { applyDefaultTagsToInstances, backupInstanceTags } from './instances'
import { applyInstanceTagsToVolumes } from './volumes'

export const PARAMETER_NAME = '/tag-sync/tags'
export const OVERWRITE_TAGS_ON_VOLUME_FROM_INSTANCE = true
export const OVERWRITE_TAGS_ON_INSTANCE_FROM_DEFAULT = true
export const APPLY_DEFAULT_TAGS_TO_INSTANCES = true
export const DRY_RUN_INSTANCES = true
export const DRY_RUN_VOLUMES = true

// Retrieves a JSON blob from SSM Parameter Store to use as default tags
export async function getTagsFromSssm( ssmClient: SSMClient ): Promise<Map<string, string>> {
    const command = new GetParameterCommand( {
        Name: PARAMETER_NAME,
    } )

    const response = await ssmClient.send( command )

    if ( !response.Parameter || !response.Parameter.Value ) {
        throw new Error( `Parameter ${PARAMETER_NAME} not found or has no value` )
    }

    const parsedTags: Record<string, string> = JSON.parse( response.Parameter.Value )
    return new Map( Object.entries( parsedTags ) )
}

export async function listEc2Instances( ec2Client: EC2Client ): Promise<Instance[]> {
    const paginator = paginateDescribeInstances( { client: ec2Client }, {} )
    const instances: Instance[] = []
    for await ( const page of paginator ) {
        const reservations = page.Reservations!

        for ( const reservation of reservations ) {
            instances.push( ...reservation.Instances! )
        }
    }

    return instances

}

// Lists all EC2 volumes in the account and returns them as a Map with the Volume ID as the key
export async function listVolumes( ec2Client: EC2Client ): Promise<Map<string, Volume>> {
    const paginator = paginateDescribeVolumes( { client: ec2Client }, {} )

    const volumeMap = new Map<string, Volume>()

    for await ( const page of paginator ) {
        const volumeList = page.Volumes!

        for ( const volume of volumeList ) {
            volumeMap.set( volume.VolumeId!, volume )
        }
    }
    return volumeMap
}



export async function main() {
    const ssmClient = new SSMClient( { region: 'us-east-1' } )
    const ec2Client = new EC2Client( { region: 'us-east-1' } )

    const defaultTags = await getTagsFromSssm( ssmClient )
    // console.log( defaultTags )

    let instances = await listEc2Instances( ec2Client )

    backupInstanceTags( instances )

    if ( APPLY_DEFAULT_TAGS_TO_INSTANCES ) {
        await applyDefaultTagsToInstances( ec2Client, instances, defaultTags )
        // We need to re-fetch the instances after applying default tags, as the tags might have changed
        instances = await listEc2Instances( ec2Client )
    }

    const volumes = await listVolumes( ec2Client )

    for ( const instance of instances ) {
        console.log( `Processing instance '${instance.InstanceId}'` )
        await applyInstanceTagsToVolumes( ec2Client, instance, volumes )
    }
}




main().then( () => {
    console.log( 'Done' )
} )